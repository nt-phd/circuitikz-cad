/**
 * Renders ghost (placement preview) and selection indicators on the overlay SVG.
 * Uses scaleState.effectiveGridSize so coordinates stay aligned with the
 * pdflatex-rendered SVG regardless of \begin{tikzpicture}[scale=...].
 */
import type { GridPoint, BipoleInstance, ComponentInstance, ComponentDef, DrawingInstance, WireInstance } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import type { CircuitDocument } from '../model/CircuitDocument';
import { SELECTION_COLOR, GHOST_OPACITY } from '../constants';
import { scaleState } from './ScaleState';
import { createGroup, createLine, createRect } from '../utils/svg';
import { getBipoleBodyMetrics, getPlacedComponentMetrics } from './ComponentGeometry';
import { componentProbeService, type ComponentRenderProbe } from './ComponentProbeService';

const OVERLAY_STROKE_WIDTH = 0.5;
const SELECTION_LINE_OPACITY = 1;
const GHOST_LINE_OPACITY = 0.8;
const OVERLAY_CROSS_SIZE = 0.15;

export interface GhostLatexPreview {
  anchorX: number;
  anchorY: number;
  angleDeg?: number;
  opacity: number;
  svgMarkup: string;
  tx: number;
  ty: number;
}

export class GhostRenderer {
  private ghostGroup: SVGGElement;
  private selectionGroup: SVGGElement;

  constructor(
    private overlaySvg: SVGSVGElement,
    private doc: CircuitDocument,
    private registry: ComponentRegistry,
    private selection: SelectionState,
    private setLatexGhostPreview: (preview: GhostLatexPreview | null) => void,
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
    if (!el) this.setLatexGhostPreview(null);
    if (el) {
      el.setAttribute('opacity', String(GHOST_OPACITY));
      this.ghostGroup.appendChild(el);
    }
  }

  buildMarqueeGhost(start: GridPoint, end: GridPoint): SVGGElement {
    this.setLatexGhostPreview(null);
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

  buildBipoleGhost(defId: string, start: GridPoint, end: GridPoint, showLatexPreview = true): SVGGElement | null {
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
      const probe = showLatexPreview
        ? componentProbeService.getBipoleGhostProbe(def, ghostComp, () => this.setGhostElement(this.buildBipoleGhost(defId, start, end, true)))
        : null;
      if (probe && showLatexPreview) {
        this.setLatexGhostPreview({
          anchorX: sx,
          anchorY: sy,
          angleDeg,
          opacity: GHOST_OPACITY,
          svgMarkup: probe.svgMarkup,
          tx: probe.tx,
          ty: probe.ty,
        });
      } else {
        this.setLatexGhostPreview(null);
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
    this.setLatexGhostPreview(null);
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
    const probe = componentProbeService.getPlacedGhostProbe(def, rotation, () => this.setGhostElement(this.buildMonopoleGhost(defId, position, rotation)));
    if (probe) {
      this.setLatexGhostPreview({
        anchorX: position.x * this.gs,
        anchorY: position.y * this.gs,
        opacity: GHOST_OPACITY,
        svgMarkup: probe.svgMarkup,
        tx: probe.tx,
        ty: probe.ty,
      });
    } else {
      this.setLatexGhostPreview(null);
    }
    const g = createGroup('ghost-monopole');
    if (!probe) {
      const ghost = this.buildPlacedComponentSelection(position.x, position.y, def, rotation, true);
      if (ghost) g.appendChild(ghost);
    } else {
      g.appendChild(this.crossAt(position.x * this.gs, position.y * this.gs, this.gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    }
    return g;
  }

  // ====== SELECTION ======

  renderSelection(): void {
    this.selectionGroup.innerHTML = '';
    for (const id of this.selection.getSelectedIds()) {
      const comp = this.doc.getComponent(id);
      if (comp) { this.renderComponentSelection(comp); continue; }
      const wire = this.doc.getWire(id);
      if (wire) { this.selectionGroup.appendChild(this.buildWireSelection(wire)); continue; }
      const drawing = this.doc.getDrawing(id);
      if (drawing) this.selectionGroup.appendChild(this.buildDrawingSelection(drawing));
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

  private buildDrawingSelection(drawing: DrawingInstance): SVGGElement {
    const gs = this.gs;
    const g = createGroup('sel-drawing');
    switch (drawing.kind) {
      case 'line':
      case 'arrow':
        g.appendChild(this.createOverlayLine(drawing.start.x * gs, drawing.start.y * gs, drawing.end.x * gs, drawing.end.y * gs, {}));
        g.appendChild(this.crossAt(drawing.start.x * gs, drawing.start.y * gs, gs * OVERLAY_CROSS_SIZE));
        g.appendChild(this.crossAt(drawing.end.x * gs, drawing.end.y * gs, gs * OVERLAY_CROSS_SIZE));
        return g;
      case 'text':
        g.appendChild(this.crossAt(drawing.position.x * gs, drawing.position.y * gs, gs * OVERLAY_CROSS_SIZE));
        return g;
      case 'rectangle': {
        const left = Math.min(drawing.start.x, drawing.end.x) * gs;
        const top = Math.min(drawing.start.y, drawing.end.y) * gs;
        const width = Math.abs(drawing.end.x - drawing.start.x) * gs;
        const height = Math.abs(drawing.end.y - drawing.start.y) * gs;
        g.appendChild(createRect(left, top, width, height, {
          fill: 'none',
          stroke: SELECTION_COLOR,
          'stroke-width': OVERLAY_STROKE_WIDTH,
          'vector-effect': 'non-scaling-stroke',
        }));
        g.appendChild(this.crossAt(drawing.start.x * gs, drawing.start.y * gs, gs * OVERLAY_CROSS_SIZE));
        g.appendChild(this.crossAt(drawing.end.x * gs, drawing.end.y * gs, gs * OVERLAY_CROSS_SIZE));
        return g;
      }
      case 'circle': {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(drawing.center.x * gs));
        circle.setAttribute('cy', String(drawing.center.y * gs));
        circle.setAttribute('r', String(drawing.radius * gs));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', SELECTION_COLOR);
        circle.setAttribute('stroke-width', String(OVERLAY_STROKE_WIDTH));
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(circle);
        g.appendChild(this.crossAt(drawing.center.x * gs, drawing.center.y * gs, gs * OVERLAY_CROSS_SIZE));
        return g;
      }
      case 'bezier': {
        g.appendChild(this.createOverlayLine(
          drawing.start.x * gs,
          drawing.start.y * gs,
          drawing.control1.x * gs,
          drawing.control1.y * gs,
          { 'stroke-dasharray': '4 3', opacity: GHOST_LINE_OPACITY },
        ));
        g.appendChild(this.createOverlayLine(
          drawing.control2.x * gs,
          drawing.control2.y * gs,
          drawing.end.x * gs,
          drawing.end.y * gs,
          { 'stroke-dasharray': '4 3', opacity: GHOST_LINE_OPACITY },
        ));
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${drawing.start.x * gs} ${drawing.start.y * gs} C ${drawing.control1.x * gs} ${drawing.control1.y * gs}, ${drawing.control2.x * gs} ${drawing.control2.y * gs}, ${drawing.end.x * gs} ${drawing.end.y * gs}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', SELECTION_COLOR);
        path.setAttribute('stroke-width', String(OVERLAY_STROKE_WIDTH));
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(path);
        g.appendChild(this.crossAt(drawing.start.x * gs, drawing.start.y * gs, gs * OVERLAY_CROSS_SIZE));
        g.appendChild(this.crossAt(drawing.control1.x * gs, drawing.control1.y * gs, gs * OVERLAY_CROSS_SIZE));
        g.appendChild(this.crossAt(drawing.control2.x * gs, drawing.control2.y * gs, gs * OVERLAY_CROSS_SIZE));
        g.appendChild(this.crossAt(drawing.end.x * gs, drawing.end.y * gs, gs * OVERLAY_CROSS_SIZE));
        return g;
      }
    }
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
    const { bodyWidth, bodyHeight, bodyX, bodyY, pinScale } = getBipoleBodyMetrics(def, gs, dist);
    g.appendChild(createRect(bodyX, bodyY, bodyWidth, bodyHeight, {
      fill: SELECTION_COLOR,
      opacity: 0.12,
    }));
    g.appendChild(this.createOverlayLine(0, 0, dist, 0, {
      'stroke-dasharray': '4 3',
      opacity: GHOST_LINE_OPACITY,
    }));
    g.appendChild(this.crossAt(0, 0, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
    g.appendChild(this.crossAt(dist, 0, gs * OVERLAY_CROSS_SIZE, GHOST_LINE_OPACITY));
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
    g.appendChild(createRect(left, top, width, height, ghost ? {
      fill: SELECTION_COLOR,
      opacity: 0.12,
    } : {
      fill: SELECTION_COLOR,
      opacity: 0.12,
      stroke: SELECTION_COLOR,
      'stroke-width': OVERLAY_STROKE_WIDTH,
      'vector-effect': 'non-scaling-stroke',
    }));
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
