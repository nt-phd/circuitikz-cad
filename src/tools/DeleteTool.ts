import type { GridPoint } from '../types';
import { BaseTool } from './BaseTool';

export class DeleteTool extends BaseTool {
  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) return;
    // Hit-testing works on circuitDoc which is populated by the parser.
    // Deletion from the raw body is not yet supported — the user can
    // delete lines manually in the Document editor.
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
