import type { ToolType, AppEvent } from '../types';
import { BaseTool, type ToolContext } from './BaseTool';
import { SelectTool } from './SelectTool';
import { PlaceBipoleTool } from './PlaceBipoleTool';
import { PlaceMonopoleTool } from './PlaceMonopoleTool';
import { WireTool } from './WireTool';
import { DeleteTool } from './DeleteTool';
import type { LatexCanvas } from '../canvas/LatexCanvas';
import type { SelectionState } from '../model/SelectionState';

export class ToolManager {
  private currentTool: BaseTool;
  private _currentType: ToolType = 'select';
  private _currentDefId?: string;

  constructor(
    private ctx: ToolContext,
    private canvas: LatexCanvas,
    private selection: SelectionState,
    private emitEvent: (event: AppEvent) => void,
  ) {
    this.currentTool = new SelectTool(ctx, selection);
    this.attachListeners();
  }

  get currentType(): ToolType { return this._currentType; }
  get currentDefId(): string | undefined { return this._currentDefId; }

  setTool(type: ToolType, defId?: string): void {
    this.currentTool.deactivate();
    this._currentType = type;
    this._currentDefId = defId;

    const overlay = this.canvas.overlaySvg;
    switch (type) {
      case 'select':
        this.currentTool = new SelectTool(this.ctx, this.selection);
        overlay.style.cursor = 'default';
        break;
      case 'place-bipole':
        this.currentTool = new PlaceBipoleTool(this.ctx, defId!);
        overlay.style.cursor = 'crosshair';
        break;
      case 'place-monopole':
        this.currentTool = new PlaceMonopoleTool(this.ctx, defId!);
        overlay.style.cursor = 'crosshair';
        break;
      case 'wire':
        this.currentTool = new WireTool(this.ctx);
        overlay.style.cursor = 'crosshair';
        break;
      case 'delete':
        this.currentTool = new DeleteTool(this.ctx);
        overlay.style.cursor = 'not-allowed';
        break;
    }

    this.currentTool.activate();
    this.emitEvent({ type: 'tool-changed', tool: type, defId });
  }

  private attachListeners(): void {
    const el = this.canvas.overlaySvg;

    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1) return;
      if (this.canvas.isCurrentlyPanning) return;
      this.currentTool.onMouseDown(this.canvas.eventToGrid(e), e);
    });

    el.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.canvas.isCurrentlyPanning) return;
      this.currentTool.onMouseMove(this.canvas.eventToGrid(e), e);
    });

    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (this.canvas.isCurrentlyPanning) return;
      this.currentTool.onMouseUp(this.canvas.eventToGrid(e), e);
    });

    el.addEventListener('dblclick', (_e: MouseEvent) => {
      if (this.currentTool instanceof WireTool) {
        (this.currentTool as WireTool).finishWire();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'SELECT') return;
      this.currentTool.onKeyDown(e);
      if (e.key === 'Escape') this.setTool('select');
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
