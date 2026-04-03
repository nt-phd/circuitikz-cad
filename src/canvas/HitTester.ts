/**
 * Model-based hit testing — no DOM queries needed.
 * Works in grid coordinates (integer TikZ units).
 */
import type { GridPoint } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';

const HIT_THRESHOLD = 0.5; // grid units

function distPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class HitTester {
  constructor(private doc: CircuitDocument) {}

  /** Returns the id of the closest component/wire at gridPt, or null. */
  hitTest(gridPt: GridPoint): string | null {
    let best: string | null = null;
    let bestDist = HIT_THRESHOLD;

    for (const comp of this.doc.components) {
      let d = Infinity;
      if (comp.type === 'bipole') {
        d = distPointToSegment(
          gridPt.x, gridPt.y,
          comp.start.x, comp.start.y,
          comp.end.x, comp.end.y,
        );
      } else if (comp.type === 'monopole' || comp.type === 'node') {
        d = Math.hypot(gridPt.x - comp.position.x, gridPt.y - comp.position.y);
      }
      if (d < bestDist) { bestDist = d; best = comp.id; }
    }

    for (const wire of this.doc.wires) {
      for (let i = 0; i < wire.points.length - 1; i++) {
        const a = wire.points[i];
        const b = wire.points[i + 1];
        const d = distPointToSegment(gridPt.x, gridPt.y, a.x, a.y, b.x, b.y);
        if (d < bestDist) { bestDist = d; best = wire.id; }
      }
    }

    return best;
  }
}
