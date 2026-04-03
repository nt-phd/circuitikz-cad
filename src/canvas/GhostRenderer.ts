/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint, BipoleInstance, ComponentInstance, ComponentDef, WireInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { SELECTION_COLOR, GHOST_OPACITY } from '../constants';
import { scaleState } from './ScaleState';
import { createGroup, createLine, createRect } from '../utils/svg';

const OVERLAY_STROKE_WIDTH = 0.5;
const SELECTION_LINE_OPACITY = 1;
const GHOST_LINE_OPACITY = 0.8;
const OVERLAY_BOX_OPACITY = 0.22;
const GHOST_BOX_OPACITY = 0.18;
const OVERLAY_CROSS_SIZE = 0.15;

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
    const def = this.registry.get(defId);
    const g = createGroup('ghost-bipole');
    if (def) {
      const dx = ex - sx;
      const dy = ey - sy;
      const dist = Math.hypot(dx, dy);
      const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      const bodyPx = 2 * gs;
      const scale = bodyPx / def.symbolPinSpan;
      const bodyWidth = def.viewBoxW * scale;
      const bodyHeight = Math.min(def.viewBoxH * scale, gs * 1.2);
      const bodyX = dist / 2 - bodyWidth / 2;
      const bodyY = -bodyHeight / 2;
      const body = createGroup('ghost-bipole-body');
      body.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);
      body.appendChild(createRect(bodyX, bodyY, bodyWidth, bodyHeight, {
        fill: SELECTION_COLOR,
        opacity: GHOST_BOX_OPACITY,
      }));
      g.appendChild(body);
    }
    g.appendChild(this.createOverlayLine(sx, sy, ex, ey, {
      'stroke-dasharray': '4 3',
      opacity: GHOST_LINE_OPACITY,
    }));
    g.appendChild(this.crossAt(sx, sy, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    g.appendChild(this.crossAt(ex, ey, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    return g;
  }

  buildWireGhost(points: GridPoint[]): SVGGElement | null {
    if (points.length < 2) return null;
    const gs = this.gs;
    const g = createGroup('ghost-wire');
    for (const p of points) g.appendChild(this.crossAt(p.x * gs, p.y * gs, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      g.appendChild(this.createOverlayLine(
        a.x * gs, a.y * gs, b.x * gs, b.y * gs,
        { 'stroke-dasharray': '4 3', opacity: GHOST_LINE_OPACITY },
      ));
    }
    return g;
  }

  buildMonopoleGhost(defId: string, position: GridPoint, rotation = 0): SVGGElement | null {
    const def = this.registry.get(defId);
    if (!def) return null;
    const ghost = this.buildPlacedComponentSelection(position.x, position.y, def, rotation, true);
    if (!ghost) return null;
    const g = createGroup('ghost-monopole');
    g.appendChild(ghost);
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
    for (const p of wire.points) g.appendChild(this.crossAt(p.x * gs, p.y * gs, gs * OVERLAY_CROSS_SIZE));
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = wire.points[i], b = wire.points[i + 1];
      g.appendChild(this.createOverlayLine(
        a.x * gs, a.y * gs, b.x * gs, b.y * gs,
        {},
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
      opacity: OVERLAY_BOX_OPACITY,
    }));
    for (const pin of def.symbolPins ?? []) {
      const localX = dist / 2 + pin.x * scale;
      const localY = pin.y * scale;
      g.appendChild(this.crossAt(localX, localY, gs * OVERLAY_CROSS_SIZE));
    }
    return g;
  }

  private buildPlacedComponentSelection(
    x: number,
    y: number,
    def: ComponentDef,
    rotation: number,
    ghost = false,
  ): SVGGElement {
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
      opacity: ghost ? GHOST_BOX_OPACITY : OVERLAY_BOX_OPACITY,
    }));
    const pins = (def.symbolPins && def.symbolPins.length > 0)
      ? def.symbolPins
      : [{ name: 'reference', x: 0, y: 0 }];
    for (const pin of pins) {
      const projected = this.projectPlacedPin(cx, cy, pin.x * baseScale, pin.y * baseScale, rotation);
      g.appendChild(this.crossAt(
        projected.x,
        projected.y,
        gs * OVERLAY_CROSS_SIZE,
        ghost ? GHOST_LINE_OPACITY : SELECTION_LINE_OPACITY,
      ));
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

  private crossAt(x: number, y: number, halfSize: number, opacity = 1): SVGGElement {
    const g = createGroup('sel-cross');
    g.appendChild(this.createOverlayLine(x - halfSize, y - halfSize, x + halfSize, y + halfSize, { opacity }));
    g.appendChild(this.createOverlayLine(x - halfSize, y + halfSize, x + halfSize, y - halfSize, { opacity }));
    return g;
  }

  private createOverlayLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    attrs: Record<string, string | number> = {},
  ): SVGLineElement {
    return createLine(x1, y1, x2, y2, {
      stroke: SELECTION_COLOR,
      'stroke-width': OVERLAY_STROKE_WIDTH,
      'stroke-linecap': 'butt',
      'vector-effect': 'non-scaling-stroke',
      ...attrs,
    });
  }
}
