import type { ToolManager } from '../tools/ToolManager';
import type { EventBus } from '../utils/events';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { LatexDocument } from '../model/LatexDocument';
import { DEFAULT_BODY } from '../model/LatexDocument';

export class Toolbar {
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(
    parent: HTMLElement,
    private toolManager: ToolManager,
    private eventBus: EventBus,
    private circuitDoc: CircuitDocument,
    private latexDoc: LatexDocument,
  ) {
    this.build(parent);
    this.eventBus.on('tool-changed', () => this.updateActiveState());
  }

  private build(parent: HTMLElement): void {
    this.addButton(parent, 'Select', 'select', () => this.toolManager.setTool('select'));
    this.addButton(parent, 'Wire',   'wire',   () => this.toolManager.setTool('wire'));
    this.addButton(parent, 'Delete', 'delete', () => this.toolManager.setTool('delete'));

    const sep = document.createElement('div');
    sep.className = 'separator';
    parent.appendChild(sep);

    this.addButton(parent, 'Clear', 'clear', () => {
      this.circuitDoc.clear();
      this.latexDoc.body = DEFAULT_BODY;
      this.eventBus.emit({ type: 'body-changed' });
      this.eventBus.emit({ type: 'document-changed' });
    });

    this.updateActiveState();
  }

  private addButton(parent: HTMLElement, label: string, id: string, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.toolId = id;
    btn.addEventListener('click', onClick);
    this.buttons.set(id, btn);
    parent.appendChild(btn);
  }

  private updateActiveState(): void {
    const current = this.toolManager.currentType;
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle('active', id === current);
    }
  }
}
