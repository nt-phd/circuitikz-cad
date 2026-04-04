import type { GridPoint, BipoleInstance, MonopoleInstance, WireInstance, DrawingInstance } from '../types';
import { BaseTool } from './BaseTool';
import type { SelectionState } from '../model/SelectionState';

export class SelectTool extends BaseTool {
  private static readonly BIPOLE_ENDPOINT_HIT_RADIUS = 0.5;
  private selection: SelectionState;
  private isDragging = false;
  private isMarqueeSelecting = false;
  private hasDragged = false;
  private dragStartGrid: GridPoint | null = null;
  private dragBipoleEndpoint: { id: string; endpoint: 'start' | 'end' } | null = null;
  private marqueeCurrentGrid: GridPoint | null = null;
  private dragOriginalPositions = new Map<string, {
    start?: GridPoint;
    end?: GridPoint;
    position?: GridPoint;
    points?: GridPoint[];
    center?: GridPoint;
    control1?: GridPoint;
    control2?: GridPoint;
  }>();
  private marqueeBaseSelection = new Set<string>();
  private marqueeMode: 'replace' | 'add' | 'toggle' = 'replace';

  constructor(ctx: import('./BaseTool').ToolContext, selection: SelectionState) {
    super(ctx);
    this.selection = selection;
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;

    const endpointTarget = this.findSelectedBipoleEndpoint(gridPt);
    if (endpointTarget) {
      const hitComp = this.ctx.getDocument().getComponent(endpointTarget.id);
      if (hitComp?.type === 'bipole') {
        this.isMarqueeSelecting = false;
        this.isDragging = true;
        this.hasDragged = false;
        this.dragStartGrid = gridPt;
        this.dragBipoleEndpoint = endpointTarget;
        this.dragOriginalPositions.clear();
        this.dragOriginalPositions.set(endpointTarget.id, { start: { ...hitComp.start }, end: { ...hitComp.end } });
        this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
        return;
      }
    }

    const selectedIds = this.selection.getSelectedIds();
    const selectedHitId = selectedIds.length > 0
      ? this.ctx.hitTester.hitTestAmong(gridPt, new Set(selectedIds))
      : null;
    const hitId = selectedHitId ?? this.ctx.hitTester.hitTest(gridPt);

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
      this.dragBipoleEndpoint = null;

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
          continue;
        }
        const drawing = this.ctx.getDocument().getDrawing(id);
        if (drawing) {
          switch (drawing.kind) {
            case 'line':
            case 'arrow':
            case 'rectangle':
              this.dragOriginalPositions.set(id, { start: { ...drawing.start }, end: { ...drawing.end } });
              break;
            case 'text':
              this.dragOriginalPositions.set(id, { position: { ...drawing.position } });
              break;
            case 'circle':
              this.dragOriginalPositions.set(id, { center: { ...drawing.center } });
              break;
            case 'bezier':
              this.dragOriginalPositions.set(id, {
                start: { ...drawing.start },
                end: { ...drawing.end },
                control1: { ...drawing.control1 },
                control2: { ...drawing.control2 },
              });
              break;
          }
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
    if (this.dragBipoleEndpoint) {
      const comp = doc.getComponent(this.dragBipoleEndpoint.id);
      const orig = this.dragOriginalPositions.get(this.dragBipoleEndpoint.id);
      if (comp?.type === 'bipole' && orig?.start && orig?.end) {
        if (this.dragBipoleEndpoint.endpoint === 'start') {
          comp.start = { x: orig.start.x + dx, y: orig.start.y + dy };
          comp.end = { ...orig.end };
        } else {
          comp.start = { ...orig.start };
          comp.end = { x: orig.end.x + dx, y: orig.end.y + dy };
        }
        this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
      }
      return;
    }
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
          continue;
        }
        const drawing = doc.getDrawing(id);
        if (drawing) {
          switch (drawing.kind) {
            case 'line':
            case 'arrow':
            case 'rectangle':
              if (orig.start && orig.end) {
                drawing.start = { x: orig.start.x + dx, y: orig.start.y + dy };
                drawing.end = { x: orig.end.x + dx, y: orig.end.y + dy };
              }
              break;
            case 'text':
              if (orig.position) drawing.position = { x: orig.position.x + dx, y: orig.position.y + dy };
              break;
            case 'circle':
              if (orig.center) drawing.center = { x: orig.center.x + dx, y: orig.center.y + dy };
              break;
            case 'bezier':
              if (orig.start && orig.end && orig.control1 && orig.control2) {
                drawing.start = { x: orig.start.x + dx, y: orig.start.y + dy };
                drawing.end = { x: orig.end.x + dx, y: orig.end.y + dy };
                drawing.control1 = { x: orig.control1.x + dx, y: orig.control1.y + dy };
                drawing.control2 = { x: orig.control2.x + dx, y: orig.control2.y + dy };
              }
              break;
          }
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
    this.dragBipoleEndpoint = null;
    this.dragOriginalPositions.clear();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.ctx.deleteElements(this.selection.getSelectedIds());
    }
  }

  private getHitBipoleEndpoint(gridPt: GridPoint, comp: BipoleInstance): 'start' | 'end' | null {
    const startDist = Math.hypot(gridPt.x - comp.start.x, gridPt.y - comp.start.y);
    const endDist = Math.hypot(gridPt.x - comp.end.x, gridPt.y - comp.end.y);
    const radius = SelectTool.BIPOLE_ENDPOINT_HIT_RADIUS;
    if (startDist > radius && endDist > radius) return null;
    return startDist <= endDist ? 'start' : 'end';
  }

  private findSelectedBipoleEndpoint(gridPt: GridPoint): { id: string; endpoint: 'start' | 'end' } | null {
    for (const id of this.selection.getSelectedIds()) {
      const comp = this.ctx.getDocument().getComponent(id);
      if (comp?.type !== 'bipole') continue;
      const endpoint = this.getHitBipoleEndpoint(gridPt, comp);
      if (endpoint) return { id, endpoint };
    }
    return null;
  }
}
