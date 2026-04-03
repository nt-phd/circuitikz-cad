/**
 * CodePanel — attaches to two separate DOM containers:
 *   preambleParent  — the collapsible Preamble section body
 *   documentParent  — the always-visible Document section body
 *
 * Flow:
 *   CAD tool → document-changed → latexDoc.body updated → body-changed → textarea synced
 *   User edits textarea → latexDoc updated → user-edited-latex → canvas re-renders
 */

import type { LatexDocument } from '../model/LatexDocument';
import type { EventBus } from '../utils/events';

const RENDER_DEBOUNCE_MS = 600;

export class CodePanel {
  private preambleArea: HTMLTextAreaElement;
  private bodyArea: HTMLTextAreaElement;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private updatingFromModel = false;

  constructor(
    preambleParent: HTMLElement,
    documentParent: HTMLElement,
    private latexDoc: LatexDocument,
    private eventBus: EventBus,
  ) {
    // ── Preamble textarea ────────────────────────────────────────────────
    this.preambleArea = this.makeTextarea();
    this.preambleArea.value = this.latexDoc.preamble;
    preambleParent.appendChild(this.preambleArea);

    // ── Document textarea + copy button ──────────────────────────────────
    const copyRow = document.createElement('div');
    copyRow.className = 'code-copy-row';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => this.onCopy(copyBtn));
    copyRow.appendChild(copyBtn);
    documentParent.appendChild(copyRow);

    this.bodyArea = this.makeTextarea();
    this.bodyArea.value = this.latexDoc.body;
    documentParent.appendChild(this.bodyArea);

    // ── Events ───────────────────────────────────────────────────────────

    // CAD tool updated latexDoc.body → sync textarea
    this.eventBus.on('body-changed', () => this.syncBodyFromModel());

    // User edits → update model → schedule render
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

    // Prevent tool shortcuts while typing in textareas
    this.preambleArea.addEventListener('keydown', e => e.stopPropagation());
    this.bodyArea.addEventListener('keydown',    e => e.stopPropagation());
  }

  private makeTextarea(): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.className = 'code-textarea';
    ta.spellcheck = false;
    (ta as any).autocorrect = 'off';
    (ta as any).autocapitalize = 'off';
    return ta;
  }

  private syncBodyFromModel(): void {
    this.updatingFromModel = true;
    const hasFocus = document.activeElement === this.bodyArea;
    const s = this.bodyArea.selectionStart;
    const e = this.bodyArea.selectionEnd;
    this.bodyArea.value = this.latexDoc.body;
    if (hasFocus) this.bodyArea.setSelectionRange(s, e);
    this.updatingFromModel = false;
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.eventBus.emit({ type: 'user-edited-latex' });
    }, RENDER_DEBOUNCE_MS);
  }

  private onCopy(btn: HTMLButtonElement): void {
    navigator.clipboard.writeText(this.latexDoc.toFullSource()).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }
}
