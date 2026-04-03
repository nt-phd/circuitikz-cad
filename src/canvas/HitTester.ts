/**
 * Model-based hit testing — no DOM queries needed.
 * Works in grid coordinates (integer TikZ units).
 */
import type { GridPoint } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';

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
  constructor(
    private doc: CircuitDocument,
    private registry: ComponentRegistry,
  ) {}

  /** Returns the id of the closest component/wire at gridPt, or null. */
  hitTest(gridPt: GridPoint): string | null {
    let best: string | null = null;
    let bestDist = HIT_THRESHOLD;

    for (const comp of this.doc.components) {
      let d = Infinity;
      if (comp.type === 'bipole') {
        const def = this.registry.get(comp.defId);
        if (!def) continue;
        const dx = comp.end.x - comp.start.x;
        const dy = comp.end.y - comp.start.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) continue;
        const ux = dx / dist;
        const uy = dy / dist;
        const relX = gridPt.x - comp.start.x;
        const relY = gridPt.y - comp.start.y;
        const localX = relX * ux + relY * uy;
        const localY = -relX * uy + relY * ux;
        const bodyWidth = 2 * def.viewBoxW / def.symbolPinSpan;
        const bodyHeight = Math.min(2 * def.viewBoxH / def.symbolPinSpan, 1.2);
        const bodyX = dist / 2 - bodyWidth / 2;
        const bodyY = -bodyHeight / 2;
        if (
          localX >= bodyX &&
          localX <= bodyX + bodyWidth &&
          localY >= bodyY &&
          localY <= bodyY + bodyHeight
        ) {
          d = 0;
        }
      } else if (comp.type === 'monopole' || comp.type === 'node') {
        const def = this.registry.get(comp.defId);
        if (!def) continue;
        const scale = def.placementType === 'node'
          ? 3 / def.viewBoxW
          : 1.5 / def.viewBoxH;
        const width = def.viewBoxW * scale;
        const height = def.viewBoxH * scale;
        const angle = -(comp.rotation ?? 0) * Math.PI / 180;
        const relX = gridPt.x - comp.position.x;
        const relY = gridPt.y - comp.position.y;
        const localX = relX * Math.cos(angle) - relY * Math.sin(angle);
        const localY = relX * Math.sin(angle) + relY * Math.cos(angle);
        const left = -def.symbolRefX * scale;
        const top = -def.symbolRefY * scale;
        if (
          localX >= left &&
          localX <= left + width &&
          localY >= top &&
          localY <= top + height
        ) {
          d = 0;
        }
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
