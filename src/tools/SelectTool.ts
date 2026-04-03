import type { GridPoint, BipoleInstance, MonopoleInstance } from '../types';
import { BaseTool } from './BaseTool';
import type { SelectionState } from '../model/SelectionState';

export class SelectTool extends BaseTool {
  private selection: SelectionState;
  private isDragging = false;
  private hasDragged = false;
  private dragStartGrid: GridPoint | null = null;
  private dragOriginalPositions = new Map<string, { start?: GridPoint; end?: GridPoint; position?: GridPoint }>();

  constructor(ctx: import('./BaseTool').ToolContext, selection: SelectionState) {
    super(ctx);
    this.selection = selection;
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;

    const hitId = this.ctx.hitTester.hitTest(gridPt);

    if (hitId) {
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
        }
      }
      this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
    } else {
      this.selection.clear();
      this.ctx.emit({ type: 'selection-changed', selectedIds: [], source: 'canvas' });
    }
    // Emit document-changed only to refresh selection overlay — but only
    // if circuitDoc actually has content (so we don't trigger body overwrite
    // when the user clicks on free-form LaTeX content not in the model).
    // We use a dedicated 'selection-changed' for overlay refresh; PropertyPanel
    // listens to selection-changed already, so no document-changed needed here.
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    if (!this.isDragging || !this.dragStartGrid) return;
    const dx = gridPt.x - this.dragStartGrid.x;
    const dy = gridPt.y - this.dragStartGrid.y;
    if (dx === 0 && dy === 0) return;

    this.hasDragged = true;
    const doc = this.ctx.getDocument();
    for (const [id, orig] of this.dragOriginalPositions) {
      const comp = doc.getComponent(id);
      if (!comp) continue;
      if (comp.type === 'bipole' && orig.start && orig.end) {
        (comp as BipoleInstance).start = { x: orig.start.x + dx, y: orig.start.y + dy };
        (comp as BipoleInstance).end   = { x: orig.end.x   + dx, y: orig.end.y   + dy };
      } else if ((comp.type === 'monopole' || comp.type === 'node') && orig.position) {
        (comp as MonopoleInstance).position = { x: orig.position.x + dx, y: orig.position.y + dy };
      }
    }
    // Only refresh overlay during drag, not a full recompile
    this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds(), source: 'canvas' });
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {
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
