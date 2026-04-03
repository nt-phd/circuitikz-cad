/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Operates purely in world-pixel coordinates (grid * GRID_SIZE).
 */
import type { GridPoint, BipoleInstance, MonopoleInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { GRID_SIZE, WIRE_WIDTH, SELECTION_COLOR, GHOST_OPACITY } from '../constants';
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

  // ====== GHOST ======

  setGhostElement(el: SVGElement | null): void {
    this.ghostGroup.innerHTML = '';
    if (el) {
      el.setAttribute('opacity', String(GHOST_OPACITY));
      this.ghostGroup.appendChild(el);
    }
  }

  buildBipoleGhost(defId: string, start: GridPoint, end: GridPoint): SVGGElement | null {
    // Ghost is just a dashed line from start to end (body rendered by LaTeX)
    const sx = start.x * GRID_SIZE;
    const sy = start.y * GRID_SIZE;
    const ex = end.x * GRID_SIZE;
    const ey = end.y * GRID_SIZE;
    const g = createGroup('ghost-bipole');
    g.appendChild(createLine(sx, sy, ex, ey, {
      stroke: SELECTION_COLOR,
      'stroke-width': WIRE_WIDTH + 1,
      'stroke-dasharray': '6 3',
      'stroke-linecap': 'round',
    }));
    // Endpoint dots
    g.appendChild(this.dot(sx, sy));
    g.appendChild(this.dot(ex, ey));
    return g;
  }

  buildWireGhost(points: GridPoint[]): SVGGElement | null {
    if (points.length < 2) return null;
    const g = createGroup('ghost-wire');
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      g.appendChild(createLine(
        a.x * GRID_SIZE, a.y * GRID_SIZE,
        b.x * GRID_SIZE, b.y * GRID_SIZE,
        { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH, 'stroke-dasharray': '6 3', 'stroke-linecap': 'round' },
      ));
    }
    return g;
  }

  buildMonopoleGhost(defId: string, position: GridPoint, _rotation = 0): SVGGElement | null {
    const def = this.registry.get(defId);
    if (!def) return null;
    const g = createGroup('ghost-monopole');
    const px = position.x * GRID_SIZE;
    const py = position.y * GRID_SIZE;
    // Simple crosshair marker at placement point
    const size = GRID_SIZE * 0.4;
    g.appendChild(createLine(px - size, py, px + size, py, {
      stroke: SELECTION_COLOR, 'stroke-width': 1.5,
    }));
    g.appendChild(createLine(px, py - size, px, py + size, {
      stroke: SELECTION_COLOR, 'stroke-width': 1.5,
    }));
    g.appendChild(this.dot(px, py));
    return g;
  }

  // ====== SELECTION ======

  renderSelection(): void {
    this.selectionGroup.innerHTML = '';
    for (const id of this.selection.getSelectedIds()) {
      const comp = this.doc.getComponent(id);
      if (comp) {
        this.renderComponentSelection(comp);
        continue;
      }
      const wire = this.doc.getWire(id);
      if (wire) {
        for (let i = 0; i < wire.points.length - 1; i++) {
          const a = wire.points[i];
          const b = wire.points[i + 1];
          this.selectionGroup.appendChild(createLine(
            a.x * GRID_SIZE, a.y * GRID_SIZE,
            b.x * GRID_SIZE, b.y * GRID_SIZE,
            { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2, 'stroke-linecap': 'round' },
          ));
        }
      }
    }
  }

  private renderComponentSelection(comp: import('../types').ComponentInstance): void {
    let cx: number, cy: number, hw: number, hh: number;
    if (comp.type === 'bipole') {
      const mx = (comp.start.x + comp.end.x) / 2 * GRID_SIZE;
      const my = (comp.start.y + comp.end.y) / 2 * GRID_SIZE;
      const dx = (comp.end.x - comp.start.x) * GRID_SIZE;
      const dy = (comp.end.y - comp.start.y) * GRID_SIZE;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const rect = createSvgElement('rect', {
        x: -len / 2 - 4, y: -GRID_SIZE - 4,
        width: len + 8, height: GRID_SIZE * 2 + 8,
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
      cx = comp.position.x * GRID_SIZE;
      cy = comp.position.y * GRID_SIZE;
      hw = GRID_SIZE * 1.2;
      hh = GRID_SIZE * 1.2;
      this.selectionGroup.appendChild(createSvgElement('rect', {
        x: cx - hw, y: cy - hh,
        width: hw * 2, height: hh * 2,
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
