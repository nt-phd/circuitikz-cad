/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint, BipoleInstance, ComponentInstance, ComponentDef, WireInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { WIRE_WIDTH, SELECTION_COLOR, GHOST_OPACITY } from '../constants';
import { scaleState } from './ScaleState';
import { createGroup, createLine, createSvgElement, createRect } from '../utils/svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class GhostRenderer {
  private ghostGroup: SVGGElement;
  private selectionGroup: SVGGElement;

  constructor(
    private overlaySvg: SVGSVGElement,
    private doc: CircuitDocument,
    private registry: ComponentRegistry,
    private selection: SelectionState,
  ) {
    this.ghostGroup = createGroup('ghost');
    this.selectionGroup = createGroup('selection');
    this.overlaySvg.appendChild(this.selectionGroup);
    this.overlaySvg.appendChild(this.ghostGroup);
  }

  private get gs(): number { return scaleState.effectiveGridSize; }

  // ====== GHOST ======

  setGhostElement(el: SVGElement | null): void {
    this.ghostGroup.innerHTML = '';
    if (el) {
      el.setAttribute('opacity', String(GHOST_OPACITY));
      this.ghostGroup.appendChild(el);
    }
  }

  buildBipoleGhost(defId: string, start: GridPoint, end: GridPoint): SVGGElement | null {
    const gs = this.gs;
    const sx = start.x * gs, sy = start.y * gs;
    const ex = end.x   * gs, ey = end.y   * gs;
    const g = createGroup('ghost-bipole');
    g.appendChild(createLine(sx, sy, ex, ey, {
      stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 1,
      'stroke-dasharray': '6 3', 'stroke-linecap': 'round',
    }));
    g.appendChild(this.dot(sx, sy));
    g.appendChild(this.dot(ex, ey));
    return g;
  }

  buildWireGhost(points: GridPoint[]): SVGGElement | null {
    if (points.length < 2) return null;
    const gs = this.gs;
    const g = createGroup('ghost-wire');
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      g.appendChild(createLine(
        a.x * gs, a.y * gs, b.x * gs, b.y * gs,
        { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH,
          'stroke-dasharray': '6 3', 'stroke-linecap': 'round' },
      ));
    }
    return g;
  }

  buildMonopoleGhost(defId: string, position: GridPoint, _rotation = 0): SVGGElement | null {
    if (!this.registry.get(defId)) return null;
    const gs = this.gs;
    const px = position.x * gs, py = position.y * gs;
    const size = gs * 0.4;
    const g = createGroup('ghost-monopole');
    g.appendChild(createLine(px - size, py, px + size, py, { stroke: SELECTION_COLOR, 'stroke-width': 1.5 }));
    g.appendChild(createLine(px, py - size, px, py + size, { stroke: SELECTION_COLOR, 'stroke-width': 1.5 }));
    g.appendChild(this.dot(px, py));
    return g;
  }

  // ====== SELECTION ======

  renderSelection(): void {
    this.selectionGroup.innerHTML = '';
    for (const id of this.selection.getSelectedIds()) {
      const comp = this.doc.getComponent(id);
      if (comp) { this.renderComponentSelection(comp); continue; }
      const wire = this.doc.getWire(id);
      if (wire) this.selectionGroup.appendChild(this.buildWireSelection(wire));
    }
  }

  private renderComponentSelection(comp: ComponentInstance): void {
    const def = this.registry.get(comp.defId);
    if (!def) return;
    if (comp.type === 'bipole') {
      this.selectionGroup.appendChild(this.buildBipoleSelection(comp, def));
      return;
    }
    this.selectionGroup.appendChild(this.buildPlacedComponentSelection(comp.position.x, comp.position.y, def, comp.rotation));
  }

  private buildWireSelection(wire: WireInstance): SVGGElement {
    const gs = this.gs;
    const g = createGroup('sel-wire');
    for (const p of wire.points) g.appendChild(this.crossAt(p.x * gs, p.y * gs, gs * 0.15));
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = wire.points[i], b = wire.points[i + 1];
      g.appendChild(createLine(
        a.x * gs, a.y * gs, b.x * gs, b.y * gs,
        { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2, 'stroke-linecap': 'round' },
      ));
    }
    return g;
  }

  private buildBipoleSelection(comp: BipoleInstance, def: ComponentDef): SVGGElement {
    const gs = this.gs;
    const sx = comp.start.x * gs;
    const sy = comp.start.y * gs;
    const ex = comp.end.x * gs;
    const ey = comp.end.y * gs;
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.hypot(dx, dy);
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

    const g = createGroup('sel-bipole');
    g.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);
    const bodyPx = 2 * gs;
    const scale = bodyPx / def.symbolPinSpan;
    const bodyWidth = def.viewBoxW * scale;
    const bodyHeight = Math.min(def.viewBoxH * scale, gs * 1.2);
    const bodyX = dist / 2 - bodyWidth / 2;
    const bodyY = -bodyHeight / 2;
    g.appendChild(createRect(bodyX, bodyY, bodyWidth, bodyHeight, {
      fill: SELECTION_COLOR,
      opacity: 0.22,
    }));
    for (const pin of def.symbolPins ?? []) {
      const localX = dist / 2 + pin.x * scale;
      const localY = pin.y * scale;
      g.appendChild(this.crossAt(localX, localY, gs * 0.15));
    }
    return g;
  }

  private buildPlacedComponentSelection(x: number, y: number, def: ComponentDef, rotation: number): SVGGElement {
    const gs = this.gs;
    const cx = x * gs;
    const cy = y * gs;
    const baseScale = def.placementType === 'node'
      ? (gs * 3) / def.viewBoxW
      : (gs * 1.5) / def.viewBoxH;
    const width = def.viewBoxW * baseScale;
    const height = def.viewBoxH * baseScale;
    const left = cx - def.symbolRefX * baseScale;
    const top = cy - def.symbolRefY * baseScale;
    const g = createGroup('sel-point');
    g.appendChild(createRect(left, top, width, height, {
      fill: SELECTION_COLOR,
      opacity: 0.22,
    }));
    const pins = (def.symbolPins && def.symbolPins.length > 0)
      ? def.symbolPins
      : [{ name: 'reference', x: 0, y: 0 }];
    for (const pin of pins) {
      const projected = this.projectPlacedPin(cx, cy, pin.x * baseScale, pin.y * baseScale, rotation);
      g.appendChild(this.crossAt(projected.x, projected.y, gs * 0.15));
    }
    return g;
  }

  private projectPlacedPin(
    centerX: number,
    centerY: number,
    offsetX: number,
    offsetY: number,
    rotation: number,
  ): { x: number; y: number } {
    if (!rotation) return { x: centerX + offsetX, y: centerY + offsetY };
    const angle = rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos,
    };
  }

  private crossAt(x: number, y: number, halfSize: number): SVGGElement {
    const g = createGroup('sel-cross');
    g.appendChild(createLine(x - halfSize, y - halfSize, x + halfSize, y + halfSize, {
      stroke: SELECTION_COLOR, 'stroke-width': 0.5, 'stroke-linecap': 'butt',
    }));
    g.appendChild(createLine(x - halfSize, y + halfSize, x + halfSize, y - halfSize, {
      stroke: SELECTION_COLOR, 'stroke-width': 0.5, 'stroke-linecap': 'butt',
    }));
    return g;
  }

  private dot(x: number, y: number): SVGCircleElement {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(y));
    c.setAttribute('r', '3');
    c.setAttribute('fill', SELECTION_COLOR);
    return c;
  }
}
