import type { ToolType, AppEvent, WireRoutingMode } from '../types';
import { BaseTool, type ToolContext } from './BaseTool';
import { SelectTool } from './SelectTool';
import { MoveTool } from './MoveTool';
import { PlaceBipoleTool } from './PlaceBipoleTool';
import { PlaceMonopoleTool } from './PlaceMonopoleTool';
import { WireTool } from './WireTool';
import { DeleteTool } from './DeleteTool';
import { DrawShapeTool } from './DrawShapeTool';
import type { LatexCanvas } from '../canvas/LatexCanvas';
import type { SelectionState } from '../model/SelectionState';

export class ToolManager {
  private currentTool: BaseTool;
  private _currentType: ToolType = 'select';
  private _currentDefId?: string;
  private _wireRoutingMode: WireRoutingMode = 'auto';

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
  get wireRoutingMode(): WireRoutingMode { return this._wireRoutingMode; }

  setTool(type: ToolType, defId?: string): void {
    this.currentTool.deactivate();
    this._currentType = type;
    this._currentDefId = defId;

    const overlay = this.canvas.overlaySvg;
    this.canvas.setPrimaryPanEnabled(false);
    switch (type) {
      case 'move':
        this.currentTool = new MoveTool(this.ctx);
        this.canvas.setPrimaryPanEnabled(true);
        overlay.style.cursor = 'grab';
        break;
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
        (this.currentTool as WireTool).setRoutingMode(this._wireRoutingMode);
        overlay.style.cursor = 'crosshair';
        break;
      case 'delete':
        this.currentTool = new DeleteTool(this.ctx);
        overlay.style.cursor = 'default';
        break;
      case 'draw-line':
        this.currentTool = new DrawShapeTool(this.ctx, 'line');
        overlay.style.cursor = 'crosshair';
        break;
      case 'draw-arrow':
        this.currentTool = new DrawShapeTool(this.ctx, 'arrow');
        overlay.style.cursor = 'crosshair';
        break;
      case 'draw-text':
        this.currentTool = new DrawShapeTool(this.ctx, 'text');
        overlay.style.cursor = 'crosshair';
        break;
      case 'draw-rectangle':
        this.currentTool = new DrawShapeTool(this.ctx, 'rectangle');
        overlay.style.cursor = 'crosshair';
        break;
      case 'draw-circle':
        this.currentTool = new DrawShapeTool(this.ctx, 'circle');
        overlay.style.cursor = 'crosshair';
        break;
      case 'draw-bezier':
        this.currentTool = new DrawShapeTool(this.ctx, 'bezier');
        overlay.style.cursor = 'crosshair';
        break;
    }

    this.currentTool.activate();
    this.emitEvent({ type: 'tool-changed', tool: type, defId });
  }

  setWireRoutingMode(mode: WireRoutingMode): void {
    this._wireRoutingMode = mode;
    if (this.currentTool instanceof WireTool) {
      this.currentTool.setRoutingMode(mode);
    }
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
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'SELECT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.ctx.undo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedIds = this.selection.getSelectedIds();
        if (selectedIds.length > 0) {
          e.preventDefault();
          this.ctx.deleteElements(selectedIds);
          return;
        }
      }

      this.currentTool.onKeyDown(e);
      if (e.key === 'Escape') this.setTool('select');
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
