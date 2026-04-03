import type { CircuiTikZEmitter } from '../codegen/CircuiTikZEmitter';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { EventBus } from '../utils/events';
import { parseCircuiTikZ } from '../codegen/CircuiTikZParser';

const PARSE_DEBOUNCE_MS = 800;

export class CodePanel {
  private textarea: HTMLTextAreaElement;
  private parseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Prevent re-entrant updates: true while we are updating the textarea from canvas */
  private updatingFromCanvas = false;

  constructor(
    parent: HTMLElement,
    private emitter: CircuiTikZEmitter,
    private doc: CircuitDocument,
    private registry: ComponentRegistry,
    private eventBus: EventBus,
  ) {
    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'code-header';

    const title = document.createElement('span');
    title.textContent = 'CircuiTikZ';
    header.appendChild(title);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copia';
    copyBtn.addEventListener('click', () => this.onCopy(copyBtn));
    header.appendChild(copyBtn);

    parent.appendChild(header);

    // ── Textarea (replaces <pre>) ────────────────────────────────────────
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'code-textarea';
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = 'off';
    (this.textarea as any).autocorrect = 'off';
    (this.textarea as any).autocapitalize = 'off';
    parent.appendChild(this.textarea);

    // Canvas → code
    this.eventBus.on('document-changed', () => this.updateFromCanvas());
    this.updateFromCanvas();

    // Code → canvas (debounced)
    this.textarea.addEventListener('input', () => this.scheduleParseAndRender());

    // Prevent tool shortcuts from firing while editing code
    this.textarea.addEventListener('keydown', (e) => e.stopPropagation());
  }

  // ── Canvas → Code ──────────────────────────────────────────────────────

  private updateFromCanvas(): void {
    if (this.updatingFromCanvas) return;
    this.updatingFromCanvas = true;

    // Preserve cursor position if textarea is focused
    const hasFocus = document.activeElement === this.textarea;
    const selStart = this.textarea.selectionStart;
    const selEnd   = this.textarea.selectionEnd;

    this.textarea.value = this.emitter.emit(this.doc);

    if (hasFocus) {
      this.textarea.setSelectionRange(selStart, selEnd);
    }

    this.updatingFromCanvas = false;
  }

  // ── Code → Canvas ──────────────────────────────────────────────────────

  private scheduleParseAndRender(): void {
    if (this.parseTimer !== null) clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.parseAndApply(), PARSE_DEBOUNCE_MS);
  }

  private parseAndApply(): void {
    this.parseTimer = null;
    try {
      parseCircuiTikZ(this.textarea.value, this.doc, this.registry);
      // Signal canvas to re-render without re-writing the textarea
      this.updatingFromCanvas = true;
      this.eventBus.emit({ type: 'document-changed' });
      this.updatingFromCanvas = false;
    } catch (err) {
      console.warn('[CodePanel] parse error:', err);
    }
  }

  // ── Copy ───────────────────────────────────────────────────────────────

  private onCopy(btn: HTMLButtonElement): void {
    navigator.clipboard.writeText(this.textarea.value || '').then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copiato!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }
}
