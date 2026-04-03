import type { GridPoint, BipoleInstance, MonopoleInstance } from '../types';
import { BaseTool } from './BaseTool';
import type { SelectionState } from '../model/SelectionState';
import { GRID_SIZE } from '../constants';

export class SelectTool extends BaseTool {
  private selection: SelectionState;
  private isDragging = false;
  private dragStartGrid: GridPoint | null = null;
  private dragTargetId: string | null = null;
  private dragOriginalPositions = new Map<string, { start?: GridPoint; end?: GridPoint; position?: GridPoint }>();

  constructor(ctx: import('./BaseTool').ToolContext, selection: SelectionState) {
    super(ctx);
    this.selection = selection;
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;

    // Hit test
    const worldX = gridPt.x * GRID_SIZE;
    const worldY = gridPt.y * GRID_SIZE;
    const hitId = this.ctx.renderer.hitTest(worldX, worldY);

    if (hitId) {
      if (e.shiftKey) {
        this.selection.toggle(hitId);
      } else if (!this.selection.isSelected(hitId)) {
        this.selection.select(hitId);
      }
      // Start drag
      this.isDragging = true;
      this.dragStartGrid = gridPt;
      this.dragTargetId = hitId;

      // Store original positions
      this.dragOriginalPositions.clear();
      for (const id of this.selection.getSelectedIds()) {
        const comp = this.ctx.getDocument().getComponent(id);
        if (comp) {
          if (comp.type === 'bipole') {
            this.dragOriginalPositions.set(id, {
              start: { ...comp.start },
              end: { ...comp.end },
            });
          } else if (comp.type === 'monopole' || comp.type === 'node') {
            this.dragOriginalPositions.set(id, {
              position: { ...comp.position },
            });
          }
        }
      }

      this.ctx.emit({ type: 'selection-changed', selectedIds: this.selection.getSelectedIds() });
    } else {
      // Click on empty: deselect
      this.selection.clear();
      this.ctx.emit({ type: 'selection-changed', selectedIds: [] });
    }
    this.ctx.emit({ type: 'document-changed' });
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    if (!this.isDragging || !this.dragStartGrid) return;

    const dx = gridPt.x - this.dragStartGrid.x;
    const dy = gridPt.y - this.dragStartGrid.y;
    if (dx === 0 && dy === 0) return;

    const doc = this.ctx.getDocument();
    for (const [id, orig] of this.dragOriginalPositions) {
      const comp = doc.getComponent(id);
      if (!comp) continue;

      if (comp.type === 'bipole' && orig.start && orig.end) {
        (comp as BipoleInstance).start = { x: orig.start.x + dx, y: orig.start.y + dy };
        (comp as BipoleInstance).end = { x: orig.end.x + dx, y: orig.end.y + dy };
      } else if ((comp.type === 'monopole' || comp.type === 'node') && orig.position) {
        (comp as MonopoleInstance).position = { x: orig.position.x + dx, y: orig.position.y + dy };
      }
    }

    // Also move selected wires
    // (simplified: wires aren't dragged in Phase 1)

    this.ctx.emit({ type: 'document-changed' });
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {
    this.isDragging = false;
    this.dragStartGrid = null;
    this.dragTargetId = null;
    this.dragOriginalPositions.clear();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const doc = this.ctx.getDocument();
      for (const id of this.selection.getSelectedIds()) {
        doc.removeComponent(id);
        doc.removeWire(id);
      }
      this.selection.clear();
      this.ctx.emit({ type: 'selection-changed', selectedIds: [] });
      this.ctx.emit({ type: 'document-changed' });
    }
  }
}
