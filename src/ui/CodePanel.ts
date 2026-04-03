/**
 * CodePanel — bidirectional LaTeX editor.
 *
 * Two sections:
 *   [Preamble]  collapsible textarea — packages, ctikzset, etc.
 *   [Body]      always-visible textarea — the TikZ/LaTeX content
 *
 * Flow:
 *   canvas tool action → emitter → doc.body updated → body textarea updated
 *   user edits textarea → latexDoc updated → 'latex-changed' event → canvas re-renders
 */

import type { LatexDocument } from '../model/LatexDocument';
import type { EventBus } from '../utils/events';

const RENDER_DEBOUNCE_MS = 800;

export class CodePanel {
  private preambleArea: HTMLTextAreaElement;
  private bodyArea: HTMLTextAreaElement;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while we're updating the textareas programmatically from a model change */
  private updatingFromModel = false;

  constructor(
    parent: HTMLElement,
    private latexDoc: LatexDocument,
    private eventBus: EventBus,
  ) {
    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'code-header';

    const title = document.createElement('span');
    title.textContent = 'LaTeX';
    header.appendChild(title);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copia tutto';
    copyBtn.addEventListener('click', () => this.onCopy(copyBtn));
    header.appendChild(copyBtn);

    parent.appendChild(header);

    // ── Preamble section (collapsible) ───────────────────────────────────
    const preambleHeader = document.createElement('div');
    preambleHeader.className = 'code-section-header';
    preambleHeader.textContent = '▶ Preambolo';
    preambleHeader.title = 'Clicca per espandere/comprimere';
    parent.appendChild(preambleHeader);

    const preambleWrap = document.createElement('div');
    preambleWrap.className = 'code-preamble-wrap collapsed';
    parent.appendChild(preambleWrap);

    this.preambleArea = document.createElement('textarea');
    this.preambleArea.className = 'code-textarea code-textarea--preamble';
    this.preambleArea.spellcheck = false;
    (this.preambleArea as any).autocorrect = 'off';
    (this.preambleArea as any).autocapitalize = 'off';
    this.preambleArea.value = this.latexDoc.preamble;
    preambleWrap.appendChild(this.preambleArea);

    preambleHeader.addEventListener('click', () => {
      const collapsed = preambleWrap.classList.toggle('collapsed');
      preambleHeader.textContent = (collapsed ? '▶' : '▼') + ' Preambolo';
    });

    // ── Body section ─────────────────────────────────────────────────────
    const bodyHeader = document.createElement('div');
    bodyHeader.className = 'code-section-header';
    bodyHeader.textContent = 'Documento';
    parent.appendChild(bodyHeader);

    this.bodyArea = document.createElement('textarea');
    this.bodyArea.className = 'code-textarea code-textarea--body';
    this.bodyArea.spellcheck = false;
    (this.bodyArea as any).autocorrect = 'off';
    (this.bodyArea as any).autocapitalize = 'off';
    this.bodyArea.value = this.latexDoc.body;
    parent.appendChild(this.bodyArea);

    // ── Events ───────────────────────────────────────────────────────────

    // Model → textarea (CAD tools wrote to latexDoc)
    this.eventBus.on('body-changed', () => this.syncFromModel());

    // Textarea edits → model → schedule render
    this.preambleArea.addEventListener('input', () => {
      if (this.updatingFromModel) return;
      this.latexDoc.preamble = this.preambleArea.value;
      this.scheduleRender();
    });

    this.bodyArea.addEventListener('input', () => {
      if (this.updatingFromModel) return;
      this.latexDoc.body = this.bodyArea.value;
      this.scheduleRender();
    });

    // Prevent tool shortcuts while editing
    this.preambleArea.addEventListener('keydown', e => e.stopPropagation());
    this.bodyArea.addEventListener('keydown', e => e.stopPropagation());
  }

  // ── Model → textarea ──────────────────────────────────────────────────

  private syncFromModel(): void {
    this.updatingFromModel = true;

    // Body: preserve cursor if focused
    if (document.activeElement !== this.bodyArea) {
      this.bodyArea.value = this.latexDoc.body;
    } else {
      const s = this.bodyArea.selectionStart;
      const e = this.bodyArea.selectionEnd;
      this.bodyArea.value = this.latexDoc.body;
      this.bodyArea.setSelectionRange(s, e);
    }

    this.updatingFromModel = false;
  }

  // ── Schedule render ───────────────────────────────────────────────────

  private scheduleRender(): void {
    if (this.renderTimer !== null) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      // Use dedicated event so main.ts doesn't overwrite latexDoc.body with emitter output
      this.eventBus.emit({ type: 'user-edited-latex' });
    }, RENDER_DEBOUNCE_MS);
  }

  // ── Copy ──────────────────────────────────────────────────────────────

  private onCopy(btn: HTMLButtonElement): void {
    const full = this.latexDoc.toFullSource();
    navigator.clipboard.writeText(full).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copiato!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }
}
