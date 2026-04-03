import type { GridPoint, WireInstance } from '../types';
import { BaseTool } from './BaseTool';
import { uid } from '../utils/uid';
import { pointsEqual } from '../utils/geometry';

export class WireTool extends BaseTool {
  private points: GridPoint[] = [];

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) {
      this.cancel();
      return;
    }

    if (this.points.length === 0) {
      // Start a new wire
      this.points.push(gridPt);
    } else {
      const last = this.points[this.points.length - 1];
      if (pointsEqual(last, gridPt)) return;

      // Manhattan routing: if not aligned, add a corner
      if (last.x !== gridPt.x && last.y !== gridPt.y) {
        // Prefer horizontal-first
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
      // Manhattan routing preview
      if (last.x !== gridPt.x && last.y !== gridPt.y) {
        preview.push({ x: gridPt.x, y: last.y });
      }
      preview.push(gridPt);
    }

    const ghost = this.ctx.renderer.buildWireGhost(preview);
    this.ctx.renderer.setGhostElement(ghost);
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.cancel();
    } else if (e.key === 'Enter') {
      this.finishWire();
    }
  }

  finishWire(): void {
    if (this.points.length >= 2) {
      const wire: WireInstance = {
        id: uid('wire'),
        points: [...this.points],
        junctions: new Map(),
      };
      this.ctx.getDocument().addWire(wire);
      this.ctx.emit({ type: 'wire-added', wire });
    }
    this.points = [];
    this.ctx.renderer.setGhostElement(null);
  }

  private cancel(): void {
    this.points = [];
    this.ctx.renderer.setGhostElement(null);
  }

  deactivate(): void {
    // If there's a wire in progress, finish it
    if (this.points.length >= 2) {
      this.finishWire();
    }
    this.points = [];
    super.deactivate();
  }
}
