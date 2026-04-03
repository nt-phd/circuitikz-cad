import type { GridPoint } from '../types';
import { BaseTool } from './BaseTool';
import { GRID_SIZE } from '../constants';

export class DeleteTool extends BaseTool {
  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;

    const worldX = gridPt.x * GRID_SIZE;
    const worldY = gridPt.y * GRID_SIZE;
    const hitId = this.ctx.renderer.hitTest(worldX, worldY);

    if (hitId) {
      const doc = this.ctx.getDocument();
      doc.removeComponent(hitId);
      doc.removeWire(hitId);
      this.ctx.emit({ type: 'document-changed' });
    }
  }

  onMouseMove(_gridPt: GridPoint, _e: MouseEvent): void {}
  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {}
}
