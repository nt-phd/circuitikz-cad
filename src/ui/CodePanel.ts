import type { CircuiTikZEmitter } from '../codegen/CircuiTikZEmitter';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { EventBus } from '../utils/events';

export class CodePanel {
  private codeElement: HTMLPreElement;

  constructor(
    parent: HTMLElement,
    private emitter: CircuiTikZEmitter,
    private doc: CircuitDocument,
    private eventBus: EventBus,
  ) {
    // Header bar
    const header = document.createElement('div');
    header.className = 'code-header';

    const title = document.createElement('span');
    title.textContent = 'CircuiTikZ Output';
    header.appendChild(title);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copia';
    copyBtn.addEventListener('click', () => this.onCopy());
    header.appendChild(copyBtn);

    parent.appendChild(header);

    // Code area
    this.codeElement = document.createElement('pre');
    parent.appendChild(this.codeElement);

    // Subscribe to changes
    this.eventBus.on('document-changed', () => this.updateCode());
    this.updateCode();
  }

  private updateCode(): void {
    this.codeElement.textContent = this.emitter.emit(this.doc);
  }

  private onCopy(): void {
    const text = this.codeElement.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = this.codeElement.parentElement?.querySelector('.copy-btn') as HTMLButtonElement;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copiato!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }
}
