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
    // Preamble textarea
    this.preambleArea = this.makeTextarea();
    this.preambleArea.value = this.latexDoc.preamble;
    preambleParent.appendChild(this.preambleArea);

    // Document: copy button + textarea
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

    // Prevent tool shortcuts while typing
    this.preambleArea.addEventListener('keydown', e => e.stopPropagation());
    this.bodyArea.addEventListener('keydown',    e => e.stopPropagation());

    // Clicking in the body textarea clears canvas selection
    this.bodyArea.addEventListener('click', () => {
      this.eventBus.emit({ type: 'selection-changed', selectedIds: [] });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Highlight the line at the given 0-based index in the body textarea.
   * Scrolls the line into view and selects it.
   */
  highlightLine(lineIndex: number): void {
    const text = this.bodyArea.value;
    const lines = text.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    let start = 0;
    for (let i = 0; i < lineIndex; i++) start += lines[i].length + 1;
    const end = start + lines[lineIndex].length;

    this.bodyArea.focus({ preventScroll: true });
    this.bodyArea.setSelectionRange(start, end);

    // Scroll line into view
    const lineHeight = parseFloat(getComputedStyle(this.bodyArea).lineHeight) || 18;
    this.bodyArea.scrollTop = Math.max(0, lineIndex * lineHeight - this.bodyArea.clientHeight / 2);
  }

  /**
   * Replace the line at lineIndex with newText, then re-render.
   * Used by PropertyPanel to update a component's source line.
   */
  replaceLine(lineIndex: number, newText: string): void {
    const lines = this.latexDoc.body.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    lines[lineIndex] = newText;
    this.latexDoc.body = lines.join('\n');
    this.syncBodyFromModel();
    this.scheduleRender();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

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
