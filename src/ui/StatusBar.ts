import type { GridPoint } from '../types';
import type { ViewTransform } from '../canvas/ViewTransform';
import type { ToolManager } from '../tools/ToolManager';
import type { EventBus } from '../utils/events';

const TOOL_LABELS: Record<string, string> = {
  'select': 'Seleziona',
  'wire': 'Filo',
  'delete': 'Cancella',
  'place-bipole': 'Piazza componente',
  'place-monopole': 'Piazza componente',
  'place-node': 'Piazza componente',
};

export class StatusBar {
  private coordSpan: HTMLSpanElement;
  private zoomSpan: HTMLSpanElement;
  private toolSpan: HTMLSpanElement;

  constructor(
    parent: HTMLElement,
    private view: ViewTransform,
    private toolManager: ToolManager,
    private eventBus: EventBus,
  ) {
    this.coordSpan = document.createElement('span');
    this.coordSpan.className = 'coord';
    this.coordSpan.textContent = 'X: 0  Y: 0';
    parent.appendChild(this.coordSpan);

    this.zoomSpan = document.createElement('span');
    this.zoomSpan.textContent = `Zoom: ${this.view.zoomPercent}%`;
    parent.appendChild(this.zoomSpan);

    this.toolSpan = document.createElement('span');
    this.toolSpan.textContent = 'Seleziona';
    parent.appendChild(this.toolSpan);

    this.eventBus.on('tool-changed', (event) => {
      if (event.type === 'tool-changed') {
        this.toolSpan.textContent = TOOL_LABELS[event.tool] || event.tool;
      }
    });
  }

  updateCoords(gridPt: GridPoint): void {
    // Display in TikZ coordinates (Y flipped)
    this.coordSpan.textContent = `X: ${gridPt.x}  Y: ${-gridPt.y}`;
    this.zoomSpan.textContent = `Zoom: ${this.view.zoomPercent}%`;
  }
}
