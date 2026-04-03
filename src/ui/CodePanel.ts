/**
 * CodePanel — bidirectional LaTeX editor.
 *
 * Two sections:
 *   Preamble  — collapsible textarea (packages, ctikzset, etc.)
 *   Body      — always-visible textarea (TikZ/LaTeX content)
 *
 * Flow:
 *   CAD tool action → document-changed → latexDoc.body updated → body-changed → textarea synced
 *   User edits textarea → latexDoc updated → user-edited-latex → canvas re-renders
 */

import type { LatexDocument } from '../model/LatexDocument';
import type { EventBus } from '../utils/events';

const RENDER_DEBOUNCE_MS = 800;

export class CodePanel {
  private preambleArea: HTMLTextAreaElement;
  private bodyArea: HTMLTextAreaElement;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private updatingFromModel = false;

  constructor(
    parent: HTMLElement,
    private latexDoc: LatexDocument,
    private eventBus: EventBus,
  ) {
    // Header
    const header = document.createElement('div');
    header.className = 'code-header';
    const title = document.createElement('span');
    title.textContent = 'LaTeX';
    header.appendChild(title);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => this.onCopy(copyBtn));
    header.appendChild(copyBtn);
    parent.appendChild(header);

    // Preamble section (collapsible)
    const preambleHeader = document.createElement('div');
    preambleHeader.className = 'code-section-header';
    preambleHeader.textContent = '▶ Preamble';
    parent.appendChild(preambleHeader);

    const preambleWrap = document.createElement('div');
    preambleWrap.className = 'code-preamble-wrap collapsed';
    parent.appendChild(preambleWrap);

    this.preambleArea = this.makeTextarea('code-textarea code-textarea--preamble');
    this.preambleArea.value = this.latexDoc.preamble;
    preambleWrap.appendChild(this.preambleArea);

    preambleHeader.addEventListener('click', () => {
      const collapsed = preambleWrap.classList.toggle('collapsed');
      preambleHeader.textContent = (collapsed ? '▶' : '▼') + ' Preamble';
    });

    // Body section
    const bodyHeader = document.createElement('div');
    bodyHeader.className = 'code-section-header';
    bodyHeader.textContent = 'Document';
    parent.appendChild(bodyHeader);

    this.bodyArea = this.makeTextarea('code-textarea code-textarea--body');
    this.bodyArea.value = this.latexDoc.body;
    parent.appendChild(this.bodyArea);

    // Model → textarea
    this.eventBus.on('body-changed', () => this.syncBodyFromModel());

    // Textarea → model → render
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

    // Prevent tool shortcuts while typing
    this.preambleArea.addEventListener('keydown', e => e.stopPropagation());
    this.bodyArea.addEventListener('keydown',    e => e.stopPropagation());
  }

  private makeTextarea(className: string): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.className = className;
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
