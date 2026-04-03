import type { GridPoint } from '../types';
import { BaseTool } from './BaseTool';
import { pointsEqual } from '../utils/geometry';
import { formatCoord } from '../codegen/CoordFormatter';

export class WireTool extends BaseTool {
  private points: GridPoint[] = [];

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) { this.cancel(); return; }

    if (this.points.length === 0) {
      this.points.push(gridPt);
    } else {
      const last = this.points[this.points.length - 1];
      if (pointsEqual(last, gridPt)) return;
      // Manhattan routing: add corner point if diagonal
      if (last.x !== gridPt.x && last.y !== gridPt.y) {
        this.points.push({ x: gridPt.x, y: last.y });
      }
      this.points.push(gridPt);
    }
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    if (this.points.length === 0) return;
    const last = this.points[this.points.length - 1];
    const preview = [...this.points];
    if (!pointsEqual(last, gridPt)) {
      if (last.x !== gridPt.x && last.y !== gridPt.y) {
        preview.push({ x: gridPt.x, y: last.y });
      }
      preview.push(gridPt);
    }
    this.ctx.ghost.setGhostElement(this.ctx.ghost.buildWireGhost(preview));
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.cancel();
    else if (e.key === 'Enter') this.finishWire();
  }

  finishWire(): void {
    if (this.points.length >= 2) {
      const coords = this.points.map(formatCoord).join(' -- ');
      this.ctx.appendLine(`\\draw ${coords};`);
    }
    this.points = [];
    this.ctx.ghost.setGhostElement(null);
  }

  private cancel(): void {
    this.points = [];
    this.ctx.ghost.setGhostElement(null);
  }

  deactivate(): void {
    if (this.points.length >= 2) this.finishWire();
    this.points = [];
    super.deactivate();
  }
}
