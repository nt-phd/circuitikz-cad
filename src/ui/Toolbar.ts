import type { ToolManager } from '../tools/ToolManager';
import type { EventBus } from '../utils/events';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { LatexDocument } from '../model/LatexDocument';
import { DEFAULT_BODY } from '../model/LatexDocument';

export class Toolbar {
  private container: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    private toolManager: ToolManager,
    private eventBus: EventBus,
    private circuitDoc: CircuitDocument,
    private latexDoc: LatexDocument,
  ) {
    this.container = parent;
    this.build();
    this.eventBus.on('tool-changed', () => this.updateActiveState());
  }

  private build(): void {
    this.addButton('Select', 'select', () => this.toolManager.setTool('select'));
    this.addButton('Wire', 'wire', () => this.toolManager.setTool('wire'));
    this.addButton('Delete', 'delete', () => this.toolManager.setTool('delete'));

    this.addSeparator();

    this.addButton('Pulisci', 'clear', () => {
      this.circuitDoc.clear();
      this.latexDoc.body = DEFAULT_BODY;
      this.eventBus.emit({ type: 'body-changed' });
      this.eventBus.emit({ type: 'document-changed' });
    });

    this.updateActiveState();
  }

  private addButton(label: string, id: string, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.toolId = id;
    btn.addEventListener('click', onClick);
    this.buttons.set(id, btn);
    this.container.appendChild(btn);
  }

  private addSeparator(): void {
    const sep = document.createElement('div');
    sep.className = 'separator';
    this.container.appendChild(sep);
  }

  private updateActiveState(): void {
    const currentType = this.toolManager.currentType;
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle('active', id === currentType);
    }
  }
}
