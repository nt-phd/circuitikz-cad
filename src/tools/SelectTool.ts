import type { GridPoint, BipoleInstance, MonopoleInstance, WireInstance } from '../types';
import { BaseTool } from './BaseTool';
import type { SelectionState } from '../model/SelectionState';

export class SelectTool extends BaseTool {
  private selection: SelectionState;
  private isDragging = false;
  private isMarqueeSelecting = false;
  private hasDragged = false;
  private dragStartGrid: GridPoint | null = null;
  private marqueeCurrentGrid: GridPoint | null = null;
  private dragOriginalPositions = new Map<string, { start?: GridPoint; end?: GridPoint; position?: GridPoint; points?: GridPoint[] }>();
  private marqueeBaseSelection = new Set<string>();
  private marqueeMode: 'replace' | 'add' | 'toggle' = 'replace';

  constructor(ctx: import('./BaseTool').ToolContext, selection: SelectionState) {
    super(ctx);
    this.selection = selection;
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;

    const hitId = this.ctx.hitTester.hitTest(gridPt);

    if (hitId) {
      this.isMarqueeSelecting = false;
      if (e.shiftKey) {
        this.selection.toggle(hitId);
      } else if (!this.selection.isSelected(hitId)) {
        this.selection.select(hitId);
      }
      this.isDragging = true;
      this.hasDragged = false;
      this.dragStartGrid = gridPt;

      this.dragOriginalPositions.clear();
      for (const id of this.selection.getSelectedIds()) {
        const comp = this.ctx.getDocument().getComponent(id);
        if (comp) {
          if (comp.type === 'bipole') {
            this.dragOriginalPositions.set(id, { start: { ...comp.start }, end: { ...comp.end } });
          } else if (comp.type === 'monopole' || comp.type === 'node') {
            this.dragOriginalPositions.set(id, { position: { ...comp.position } });
          }
          continue;
        }
        const wire = this.ctx.getDocument().getWire(id);
        if (wire) {
          this.dragOriginalPositions.set(id, { points: wire.points.map((point) => ({ ...point })) });
        }
      }
      this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
    } else {
      this.isDragging = false;
      this.isMarqueeSelecting = true;
      this.hasDragged = false;
      this.dragStartGrid = gridPt;
      this.marqueeCurrentGrid = gridPt;
      this.marqueeBaseSelection = new Set(this.selection.getSelectedIds());
      this.marqueeMode = e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'add' : 'replace';
      this.ctx.ghost.setGhostElement(this.ctx.ghost.buildMarqueeGhost(gridPt, gridPt));
    }
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    if (this.isMarqueeSelecting && this.dragStartGrid) {
      this.marqueeCurrentGrid = gridPt;
      this.hasDragged = true;
      const hitIds = this.ctx.hitTester.getElementsInRect(this.dragStartGrid, gridPt);
      if (this.marqueeMode === 'replace') {
        this.selection.setSelectedIds(hitIds);
      } else if (this.marqueeMode === 'add') {
        this.selection.setSelectedIds([...new Set([...this.marqueeBaseSelection, ...hitIds])]);
      } else {
        const next = new Set(this.marqueeBaseSelection);
        for (const id of hitIds) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        this.selection.setSelectedIds([...next]);
      }
      this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
      this.ctx.ghost.setGhostElement(this.ctx.ghost.buildMarqueeGhost(this.dragStartGrid, gridPt));
      return;
    }

    if (!this.isDragging || !this.dragStartGrid) return;
    const dx = gridPt.x - this.dragStartGrid.x;
    const dy = gridPt.y - this.dragStartGrid.y;
    if (dx === 0 && dy === 0) return;

    this.hasDragged = true;
    const doc = this.ctx.getDocument();
    for (const [id, orig] of this.dragOriginalPositions) {
      const comp = doc.getComponent(id);
      if (comp && comp.type === 'bipole' && orig.start && orig.end) {
        (comp as BipoleInstance).start = { x: orig.start.x + dx, y: orig.start.y + dy };
        (comp as BipoleInstance).end   = { x: orig.end.x   + dx, y: orig.end.y   + dy };
      } else if (comp && (comp.type === 'monopole' || comp.type === 'node') && orig.position) {
        (comp as MonopoleInstance).position = { x: orig.position.x + dx, y: orig.position.y + dy };
      } else {
        const wire = doc.getWire(id);
        if (wire && orig.points) {
          (wire as WireInstance).points = orig.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
        }
      }
    }
    // Only refresh overlay during drag, not a full recompile
    this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {
    if (this.isMarqueeSelecting) {
      if (!this.hasDragged) {
        if (this.marqueeMode === 'replace') {
          this.selection.clear();
          this.ctx.emit({ type: 'selection-changed', selectedIds: [], source: 'canvas' });
        }
      }
      this.ctx.ghost.setGhostElement(null);
      this.isMarqueeSelecting = false;
      this.hasDragged = false;
      this.dragStartGrid = null;
      this.marqueeCurrentGrid = null;
      this.marqueeBaseSelection.clear();
      return;
    }

    if (this.hasDragged) {
      // Drag completed — positions changed, regenerate body and recompile
      this.ctx.emit({ type: 'document-changed' });
    }
    this.isDragging = false;
    this.hasDragged = false;
    this.dragStartGrid = null;
    this.dragOriginalPositions.clear();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.ctx.deleteElements(this.selection.getSelectedIds());
    }
  }
}
