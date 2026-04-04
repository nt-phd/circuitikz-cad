/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint, BipoleInstance, ComponentInstance, ComponentDef, WireInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { SELECTION_COLOR, GHOST_OPACITY, TIKZ_PT_PER_UNIT, GRID_SIZE } from '../constants';
import { scaleState } from './ScaleState';
import { createGroup, createLine, createRect } from '../utils/svg';
import { getBipoleBodyMetrics, getPlacedComponentMetrics } from './ComponentGeometry';
import { componentProbeService, type ComponentRenderProbe } from './ComponentProbeService';

const OVERLAY_STROKE_WIDTH = 0.5;
const SELECTION_LINE_OPACITY = 1;
const GHOST_LINE_OPACITY = 0.8;
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

  buildMarqueeGhost(start: GridPoint, end: GridPoint): SVGGElement {
    const gs = this.gs;
    const x1 = start.x * gs;
    const y1 = start.y * gs;
    const x2 = end.x * gs;
    const y2 = end.y * gs;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const g = createGroup('ghost-marquee');
    g.appendChild(createRect(left, top, width, height, {
      fill: SELECTION_COLOR,
      opacity: 0.12,
      stroke: SELECTION_COLOR,
      'stroke-width': OVERLAY_STROKE_WIDTH,
      'stroke-dasharray': '4 3',
      'vector-effect': 'non-scaling-stroke',
    }));
    return g;
  }

  buildBipoleGhost(defId: string, start: GridPoint, end: GridPoint): SVGGElement | null {
    const gs = this.gs;
    const sx = start.x * gs, sy = start.y * gs;
    const ex = end.x   * gs, ey = end.y   * gs;
    const def = this.registry.get(defId);
    const g = createGroup('ghost-bipole');
    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.hypot(dx, dy);
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (def) {
      const ghostComp: BipoleInstance = {
        id: '__ghost__',
        defId,
        type: 'bipole',
        start,
        end,
        props: {},
      };
      const probe = componentProbeService.getBipoleGhostProbe(def, ghostComp, () => this.setGhostElement(this.buildBipoleGhost(defId, start, end)));
      if (probe) this.appendProbeSvg(g, sx, sy, probe, GHOST_OPACITY, angleDeg);
      if (!probe) {
        const { bodyWidth, bodyHeight, bodyX, bodyY } = getBipoleBodyMetrics(def, gs, dist);
        const body = createGroup('ghost-bipole-body');
        body.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);
        body.appendChild(createRect(bodyX, bodyY, bodyWidth, bodyHeight, {
          fill: SELECTION_COLOR,
          opacity: 0.12,
        }));
        g.appendChild(body);
      }
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
    this.selectionGroup.appendChild(this.buildPlacedComponentSelection(comp.position.x, comp.position.y, def, comp.rotation, false, comp.id));
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
    const probe = componentProbeService.getSelectionProbe(comp.id, comp, def, () => this.renderSelection());
    if (probe) return this.buildProbeSelectionGroup(sx, sy, probe, false, angleDeg);

    const g = createGroup('sel-bipole');
    g.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);
    const { bodyWidth, bodyHeight, bodyX, bodyY, pinScale } = getBipoleBodyMetrics(def, gs, dist);
    for (const pin of def.symbolPins ?? []) {
      const pinAbsX = def.symbolRefX + pin.x;
      const localX = bodyX + (pinAbsX - (def.shapeBBoxX ?? 0)) * pinScale;
      const localY = pin.y * pinScale;
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
    selectionId?: string,
  ): SVGGElement {
    const gs = this.gs;
    const cx = x * gs;
    const cy = y * gs;
    const selectedComp = selectionId ? this.doc.getComponent(selectionId) : undefined;
    const probe = ghost
      ? null
      : selectionId && selectedComp
        ? componentProbeService.getSelectionProbe(selectionId, selectedComp, def, () => this.renderSelection())
        : null;
    if (probe) {
      const anchorX = cx;
      const anchorY = cy;
      const g = this.buildProbeSelectionGroup(anchorX, anchorY, probe, ghost);
      return g;
    }
    const { width, height, leftOffset, topOffset, scale } = getPlacedComponentMetrics(def, gs);
    const pins = (def.symbolPins && def.symbolPins.length > 0)
      ? def.symbolPins
      : [{ name: 'reference', x: 0, y: 0 }];
    const anchorX = cx;
    const anchorY = cy;
    const left = anchorX + leftOffset;
    const top = anchorY + topOffset;
    const g = createGroup('sel-point');
    if (ghost) {
      g.appendChild(createRect(left, top, width, height, {
        fill: SELECTION_COLOR,
        opacity: 0.12,
      }));
    }
    if (ghost) {
      g.appendChild(this.crossAt(anchorX, anchorY, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    } else {
      for (const pin of pins) {
        const projected = this.projectPlacedPin(anchorX, anchorY, pin.x * scale, pin.y * scale, rotation);
        g.appendChild(this.crossAt(
          projected.x,
          projected.y,
          gs * OVERLAY_CROSS_SIZE,
          SELECTION_LINE_OPACITY,
        ));
      }
    }
    return g;
  }

  private buildProbeSelectionGroup(
    anchorX: number,
    anchorY: number,
    probe: ComponentRenderProbe,
    ghost = false,
    rotationDeg = 0,
  ): SVGGElement {
    const gs = this.gs;
    const g = createGroup('sel-probe');
    g.setAttribute('transform', `translate(${anchorX}, ${anchorY}) rotate(${rotationDeg})`);
    if (ghost) {
      g.appendChild(this.crossAt(0, 0, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    } else {
      for (const pin of probe.pinOffsets) {
        g.appendChild(this.crossAt(
          pin.x,
          pin.y,
          gs * OVERLAY_CROSS_SIZE,
          SELECTION_LINE_OPACITY,
        ));
      }
    }
    return g;
  }

  private appendProbeSvg(
    parent: SVGGElement,
    anchorX: number,
    anchorY: number,
    probe: ComponentRenderProbe,
    opacity: number,
    rotationDeg = 0,
  ): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(probe.svgMarkup, 'image/svg+xml');
    const nestedSvg = doc.querySelector('svg');
    if (!nestedSvg) return;
    const imported = document.importNode(nestedSvg, true) as SVGSVGElement;
    const ptToPx = GRID_SIZE / TIKZ_PT_PER_UNIT;
    const wrapper = createGroup('probe-svg');
    wrapper.setAttribute('transform', `translate(${anchorX}, ${anchorY}) rotate(${rotationDeg})`);
    imported.setAttribute('overflow', 'visible');
    imported.style.overflow = 'visible';
    imported.setAttribute('opacity', String(opacity));
    const vb = imported.getAttribute('viewBox')?.split(/\s+/).map(Number);
    if (vb && vb.length >= 4) {
      imported.setAttribute('width', String(vb[2] * ptToPx));
      imported.setAttribute('height', String(vb[3] * ptToPx));
      imported.setAttribute('x', String(-probe.tx * ptToPx));
      imported.setAttribute('y', String(-probe.ty * ptToPx));
      imported.setAttribute('viewBox', vb.join(' '));
    } else {
      imported.setAttribute('transform', `translate(${-probe.tx * ptToPx}, ${-probe.ty * ptToPx}) scale(${ptToPx})`);
    }
    wrapper.appendChild(imported);
    parent.appendChild(wrapper);
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
