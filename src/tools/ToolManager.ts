import type { ToolType, AppEvent } from '../types';
import { BaseTool, type ToolContext } from './BaseTool';
import { SelectTool } from './SelectTool';
import { PlaceBipoleTool } from './PlaceBipoleTool';
import { PlaceMonopoleTool } from './PlaceMonopoleTool';
import { WireTool } from './WireTool';
import { DeleteTool } from './DeleteTool';
import type { SvgCanvas } from '../canvas/SvgCanvas';
import type { SelectionState } from '../model/SelectionState';

export class ToolManager {
  private currentTool: BaseTool;
  private _currentType: ToolType = 'select';
  private _currentDefId?: string;

  constructor(
    private ctx: ToolContext,
    private svgCanvas: SvgCanvas,
    private selection: SelectionState,
    private emitEvent: (event: AppEvent) => void,
  ) {
    this.currentTool = new SelectTool(ctx, selection);
    this.attachCanvasListeners();
  }

  get currentType(): ToolType { return this._currentType; }
  get currentDefId(): string | undefined { return this._currentDefId; }

  setTool(type: ToolType, defId?: string): void {
    this.currentTool.deactivate();
    this._currentType = type;
    this._currentDefId = defId;

    switch (type) {
      case 'select':
        this.currentTool = new SelectTool(this.ctx, this.selection);
        this.svgCanvas.svgRoot.style.cursor = 'default';
        break;
      case 'place-bipole':
        this.currentTool = new PlaceBipoleTool(this.ctx, defId!);
        this.svgCanvas.svgRoot.style.cursor = 'crosshair';
        break;
      case 'place-monopole':
        this.currentTool = new PlaceMonopoleTool(this.ctx, defId!);
        this.svgCanvas.svgRoot.style.cursor = 'crosshair';
        break;
      case 'wire':
        this.currentTool = new WireTool(this.ctx);
        this.svgCanvas.svgRoot.style.cursor = 'crosshair';
        break;
      case 'delete':
        this.currentTool = new DeleteTool(this.ctx);
        this.svgCanvas.svgRoot.style.cursor = 'not-allowed';
        break;
    }

    this.currentTool.activate();
    this.emitEvent({ type: 'tool-changed', tool: type, defId });
  }

  private attachCanvasListeners(): void {
    const svg = this.svgCanvas.svgRoot;

    svg.addEventListener('mousedown', (e: MouseEvent) => {
      // Don't intercept pan (middle click, space+click)
      if (e.button === 1) return;
      if (this.svgCanvas.panZoom.isCurrentlyPanning) return;

      const gridPt = this.svgCanvas.eventToGrid(e);
      this.currentTool.onMouseDown(gridPt, e);
    });

    svg.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.svgCanvas.panZoom.isCurrentlyPanning) return;
      const gridPt = this.svgCanvas.eventToGrid(e);
      this.currentTool.onMouseMove(gridPt, e);
    });

    svg.addEventListener('mouseup', (e: MouseEvent) => {
      if (this.svgCanvas.panZoom.isCurrentlyPanning) return;
      const gridPt = this.svgCanvas.eventToGrid(e);
      this.currentTool.onMouseUp(gridPt, e);
    });

    svg.addEventListener('dblclick', (e: MouseEvent) => {
      if (this.currentTool instanceof WireTool) {
        (this.currentTool as WireTool).finishWire();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Don't capture if focus is on an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;

      this.currentTool.onKeyDown(e);

      if (e.key === 'Escape') {
        this.setTool('select');
      }
    });

    // Prevent context menu on canvas
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
