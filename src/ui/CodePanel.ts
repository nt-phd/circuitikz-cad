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

    this.codeElement = document.createElement('pre');
    parent.appendChild(this.codeElement);

    this.eventBus.on('document-changed', () => this.updateCode());
    this.updateCode();
  }

  private updateCode(): void {
    this.codeElement.textContent = this.emitter.emit(this.doc);
  }

  private onCopy(btn: HTMLButtonElement): void {
    navigator.clipboard.writeText(this.codeElement.textContent || '').then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copiato!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }
}
