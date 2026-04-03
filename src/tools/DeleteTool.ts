import type { GridPoint } from '../types';
import { BaseTool } from './BaseTool';

export class DeleteTool extends BaseTool {
  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;
    const hitId = this.ctx.hitTester.hitTest(gridPt);
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
