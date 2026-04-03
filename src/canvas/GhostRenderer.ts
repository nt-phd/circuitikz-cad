/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint } from '../types';
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
      if (wire) {
        const gs = this.gs;
        for (let i = 0; i < wire.points.length - 1; i++) {
          const a = wire.points[i], b = wire.points[i + 1];
          this.selectionGroup.appendChild(createLine(
            a.x * gs, a.y * gs, b.x * gs, b.y * gs,
            { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2, 'stroke-linecap': 'round' },
          ));
        }
      }
    }
  }

  private renderComponentSelection(comp: import('../types').ComponentInstance): void {
    const gs = this.gs;
    if (comp.type === 'bipole') {
      const mx = (comp.start.x + comp.end.x) / 2 * gs;
      const my = (comp.start.y + comp.end.y) / 2 * gs;
      const dx = (comp.end.x - comp.start.x) * gs;
      const dy = (comp.end.y - comp.start.y) * gs;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const pad = gs * 0.3;
      const rect = createSvgElement('rect', {
        x: -len / 2 - pad, y: -gs * 0.6 - pad,
        width: len + pad * 2, height: gs * 1.2 + pad * 2,
        fill: 'none', stroke: SELECTION_COLOR,
        'stroke-width': 1.5, 'stroke-dasharray': '4', rx: 3,
      });
      const g = createGroup('sel-bipole');
      g.setAttribute('transform', `translate(${mx},${my}) rotate(${angle})`);
      g.appendChild(rect);
      this.selectionGroup.appendChild(g);
      return;
    }
    if (comp.type === 'monopole' || comp.type === 'node') {
      const cx = comp.position.x * gs;
      const cy = comp.position.y * gs;
      const hw = gs * 0.7;
      this.selectionGroup.appendChild(createSvgElement('rect', {
        x: cx - hw, y: cy - hw, width: hw * 2, height: hw * 2,
        fill: 'none', stroke: SELECTION_COLOR,
        'stroke-width': 1.5, 'stroke-dasharray': '4', rx: 3,
      }));
    }
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
