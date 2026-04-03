/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint, BipoleInstance, MonopoleInstance, NodeInstance, ComponentInstance, ComponentDef, WireInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { WIRE_WIDTH, SELECTION_COLOR, GHOST_OPACITY } from '../constants';
import { scaleState } from './ScaleState';
import { createGroup, createLine, createSvgElement } from '../utils/svg';

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
    if (comp.type === 'monopole') this.selectionGroup.appendChild(this.buildMonopoleSelection(comp, def));
    if (comp.type === 'node') this.selectionGroup.appendChild(this.buildNodeSelection(comp, def));
  }

  private buildWireSelection(wire: WireInstance): SVGGElement {
    const gs = this.gs;
    const g = createGroup('sel-wire');
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
    const bodyPx = 2 * gs;
    const scale = bodyPx / def.symbolPinSpan;
    const pinStartAbsX = def.symbolRefX - def.symbolPinSpan / 2;
    const pinEndAbsX = def.symbolRefX + def.symbolPinSpan / 2;
    const pinStartPx = pinStartAbsX * scale;
    const pinEndPx = pinEndAbsX * scale;
    const refXPx = def.symbolRefX * scale;
    const refYPx = def.symbolRefY * scale;
    const axisOffset = dist / 2 - refXPx;
    const leadEndStart = axisOffset + pinStartPx;
    const leadStartEnd = axisOffset + pinEndPx;

    const g = createGroup('sel-bipole');
    g.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);
    if (leadEndStart > 0.5) {
      g.appendChild(createLine(0, 0, leadEndStart, 0, {
        stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2, 'stroke-linecap': 'round',
      }));
    }
    if (dist - leadStartEnd > 0.5) {
      g.appendChild(createLine(leadStartEnd, 0, dist, 0, {
        stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2, 'stroke-linecap': 'round',
      }));
    }

    const symG = document.createElementNS(SVG_NS, 'g');
    symG.setAttribute('transform', `translate(${axisOffset}, ${-refYPx}) scale(${scale})`);
    symG.appendChild(this.createSelectionUse(def.symbolId));
    g.appendChild(symG);
    return g;
  }

  private buildMonopoleSelection(comp: MonopoleInstance, def: ComponentDef): SVGGElement {
    const gs = this.gs;
    const wx = comp.position.x * gs;
    const wy = comp.position.y * gs;
    const scale = (gs * 1.5) / def.viewBoxH;
    const tx = wx - def.symbolRefX * scale;
    const ty = wy - def.symbolRefY * scale;
    const g = createGroup('sel-monopole');
    g.setAttribute(
      'transform',
      `translate(${tx}, ${ty}) rotate(${comp.rotation}, ${def.symbolRefX * scale}, ${def.symbolRefY * scale}) scale(${scale})`,
    );
    g.appendChild(this.createSelectionUse(def.symbolId));
    return g;
  }

  private buildNodeSelection(comp: NodeInstance, def: ComponentDef): SVGGElement {
    const gs = this.gs;
    const wx = comp.position.x * gs;
    const wy = comp.position.y * gs;
    const scale = (gs * 3) / def.viewBoxW;
    const tx = wx - def.symbolRefX * scale;
    const ty = wy - def.symbolRefY * scale;
    const g = createGroup('sel-node');
    g.setAttribute('transform', `translate(${tx}, ${ty}) scale(${scale})`);
    g.appendChild(this.createSelectionUse(def.symbolId));
    return g;
  }

  private createSelectionUse(symbolId: string): SVGUseElement {
    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', `#${symbolId}`);
    useEl.setAttribute('stroke', SELECTION_COLOR);
    useEl.setAttribute('fill', SELECTION_COLOR);
    useEl.setAttribute('opacity', '0.9');
    return useEl;
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
