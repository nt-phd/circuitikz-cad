/**
 * Model-based hit testing — no DOM queries needed.
 * Works in grid coordinates (integer TikZ units).
 */
import type { ConnectionRef, GridPoint } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import { getBipoleBodyMetrics, getPlacedComponentMetrics } from './ComponentGeometry';
import { componentProbeService } from './ComponentProbeService';
import { scaleState } from './ScaleState';

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

function pointInRect(px: number, py: number, left: number, top: number, right: number, bottom: number): boolean {
  return px >= left && px <= right && py >= top && py <= bottom;
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = ccw(ax, ay, bx, by, cx, cy);
  const d2 = ccw(ax, ay, bx, by, dx, dy);
  const d3 = ccw(cx, cy, dx, dy, ax, ay);
  const d4 = ccw(cx, cy, dx, dy, bx, by);
  return (d1 === 0 && d2 === 0)
    ? Math.max(Math.min(ax, bx), Math.min(cx, dx)) <= Math.min(Math.max(ax, bx), Math.max(cx, dx)) &&
        Math.max(Math.min(ay, by), Math.min(cy, dy)) <= Math.min(Math.max(ay, by), Math.max(cy, dy))
    : (d1 <= 0 && d2 >= 0 || d1 >= 0 && d2 <= 0) && (d3 <= 0 && d4 >= 0 || d3 >= 0 && d4 <= 0);
}

function segmentIntersectsRect(
  ax: number, ay: number, bx: number, by: number,
  left: number, top: number, right: number, bottom: number,
): boolean {
  if (pointInRect(ax, ay, left, top, right, bottom) || pointInRect(bx, by, left, top, right, bottom)) {
    return true;
  }
  if (Math.max(ax, bx) < left || Math.min(ax, bx) > right || Math.max(ay, by) < top || Math.min(ay, by) > bottom) {
    return false;
  }
  return (
    segmentsIntersect(ax, ay, bx, by, left, top, right, top) ||
    segmentsIntersect(ax, ay, bx, by, right, top, right, bottom) ||
    segmentsIntersect(ax, ay, bx, by, right, bottom, left, bottom) ||
    segmentsIntersect(ax, ay, bx, by, left, bottom, left, top)
  );
}

export class HitTester {
  connectionSnapEnabled = true;

  constructor(
    private doc: CircuitDocument,
    private registry: ComponentRegistry,
  ) {}

  findNearestConnectionTarget(gridPt: GridPoint, radius = 0.5, onResolved?: () => void): { point: GridPoint; ref?: ConnectionRef } | null {
    let best: { point: GridPoint; ref?: ConnectionRef } | null = null;
    let bestDist = radius;

    const consider = (pt: GridPoint, ref?: ConnectionRef) => {
      const d = Math.hypot(gridPt.x - pt.x, gridPt.y - pt.y);
      if (d <= bestDist) {
        bestDist = d;
        best = { point: pt, ref };
      }
    };

    for (const comp of this.doc.components) {
      if (comp.type === 'bipole') {
        consider(comp.start);
        consider(comp.end);
        continue;
      }

      const def = this.registry.get(comp.defId);
      if (!def) continue;
      const probe = componentProbeService.getSelectionProbe(comp.id, comp, def, onResolved ?? (() => {}));
      if (probe && probe.pinOffsets.length > 0) {
        for (const pin of probe.pinOffsets) {
          const ref = comp.nodeName ? { componentId: comp.id, nodeName: comp.nodeName, anchor: pin.name } : undefined;
          consider({
            x: comp.position.x + pin.x / scaleState.effectiveGridSize,
            y: comp.position.y + pin.y / scaleState.effectiveGridSize,
          }, ref);
        }
        continue;
      }
      const { scale } = getPlacedComponentMetrics(def, 1);
      const angle = (comp.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const pins = (def.symbolPins && def.symbolPins.length > 0)
        ? def.symbolPins
        : [{ name: 'reference', x: 0, y: 0 }];

      for (const pin of pins) {
        const localX = pin.x * scale;
        const localY = pin.y * scale;
        const ref = comp.nodeName ? { componentId: comp.id, nodeName: comp.nodeName, anchor: pin.name } : undefined;
        consider({
          x: comp.position.x + localX * cos - localY * sin,
          y: comp.position.y + localX * sin + localY * cos,
        }, ref);
      }
    }

    for (const wire of this.doc.wires) {
      if (wire.points.length === 0) continue;
      consider(wire.points[0], wire.startRef);
      consider(wire.points[wire.points.length - 1], wire.endRef);
    }

    return best;
  }

  findNearestConnectionPoint(gridPt: GridPoint, radius = 0.5, onResolved?: () => void): GridPoint | null {
    return this.findNearestConnectionTarget(gridPt, radius, onResolved)?.point ?? null;
  }

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
        const { bodyWidth, bodyHeight } = getBipoleBodyMetrics(def, 1, dist);
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
        const { width, height, leftOffset, topOffset } = getPlacedComponentMetrics(def, 1);
        const angle = -(comp.rotation ?? 0) * Math.PI / 180;
        const relX = gridPt.x - comp.position.x;
        const relY = gridPt.y - comp.position.y;
        const localX = relX * Math.cos(angle) - relY * Math.sin(angle);
        const localY = relX * Math.sin(angle) + relY * Math.cos(angle);
        const left = leftOffset;
        const top = topOffset;
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

  getElementsInRect(a: GridPoint, b: GridPoint): string[] {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const ids: string[] = [];

    for (const comp of this.doc.components) {
      if (comp.type === 'bipole') {
        const def = this.registry.get(comp.defId);
        if (!def) continue;
        const dx = comp.end.x - comp.start.x;
        const dy = comp.end.y - comp.start.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) continue;
        const ux = dx / dist;
        const uy = dy / dist;
        const { bodyWidth, bodyHeight } = getBipoleBodyMetrics(def, 1, dist);
        const bodyX = dist / 2 - bodyWidth / 2;
        const bodyY = -bodyHeight / 2;
        const corners = [
          { x: bodyX, y: bodyY },
          { x: bodyX + bodyWidth, y: bodyY },
          { x: bodyX + bodyWidth, y: bodyY + bodyHeight },
          { x: bodyX, y: bodyY + bodyHeight },
        ].map((p) => ({
          x: comp.start.x + p.x * ux - p.y * uy,
          y: comp.start.y + p.x * uy + p.y * ux,
        }));
        const xs = corners.map((p) => p.x);
        const ys = corners.map((p) => p.y);
        if (!(Math.max(...xs) < left || Math.min(...xs) > right || Math.max(...ys) < top || Math.min(...ys) > bottom)) {
          ids.push(comp.id);
        }
        continue;
      }

      const def = this.registry.get(comp.defId);
      if (!def) continue;
      const { width, height, leftOffset, topOffset } = getPlacedComponentMetrics(def, 1);
      const leftLocal = leftOffset;
      const topLocal = topOffset;
      const angle = (comp.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        { x: leftLocal, y: topLocal },
        { x: leftLocal + width, y: topLocal },
        { x: leftLocal + width, y: topLocal + height },
        { x: leftLocal, y: topLocal + height },
      ].map((p) => ({
        x: comp.position.x + p.x * cos - p.y * sin,
        y: comp.position.y + p.x * sin + p.y * cos,
      }));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      if (!(Math.max(...xs) < left || Math.min(...xs) > right || Math.max(...ys) < top || Math.min(...ys) > bottom)) {
        ids.push(comp.id);
      }
    }

    for (const wire of this.doc.wires) {
      for (let i = 0; i < wire.points.length - 1; i++) {
        const p1 = wire.points[i];
        const p2 = wire.points[i + 1];
        if (segmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, left, top, right, bottom)) {
          ids.push(wire.id);
          break;
        }
      }
    }

    return ids;
  }
}
