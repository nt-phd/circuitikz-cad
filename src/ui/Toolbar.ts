import type { ToolManager } from '../tools/ToolManager';
import type { EventBus } from '../utils/events';
import type { CircuitDocument } from '../model/CircuitDocument';

export class Toolbar {
  private container: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    private toolManager: ToolManager,
    private eventBus: EventBus,
    private doc: CircuitDocument,
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

    // Clear all button
    this.addButton('Pulisci', 'clear', () => {
      this.doc.clear();
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
