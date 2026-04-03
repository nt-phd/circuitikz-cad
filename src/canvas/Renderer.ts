import type { ComponentInstance, BipoleInstance, MonopoleInstance, NodeInstance, WireInstance } from '../types';
import type { ComponentDef } from '../types';
import { GRID_SIZE, WIRE_COLOR, WIRE_WIDTH, SELECTION_COLOR, GHOST_OPACITY } from '../constants';
import { createGroup, createLine, createCircle, createSvgElement, setAttrs } from '../utils/svg';
import type { ViewTransform } from './ViewTransform';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';

/**
 * Rendering strategy for bipoles (path-type symbols):
 *
 * Each symbol in symbols.svg spans from pin START to pin END.
 * The span in SVG units is `symbolPinSpan` (typically ~42.33 pts).
 *
 * To render between two grid points (start, end):
 *   1. Compute world-pixel distance: dist = |end - start| * GRID_SIZE
 *   2. Scale factor: s = dist / symbolPinSpan
 *   3. The symbol is drawn from its own origin (0,0); its START pin is at
 *      refX - symbolPinSpan/2 from the left edge. After scaling, we translate
 *      so the START pin aligns with the world start point.
 *   4. Rotate around the start point by the angle of (end - start).
 *
 * For node/monopole symbols:
 *   - The reference point (refX, refY) in SVG units maps to the grid position.
 *   - Scale: GRID_SIZE / some_base_unit (we use the viewBoxH as basis for size)
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  private contentGroup: SVGGElement;
  private wiresGroup: SVGGElement;
  private componentsGroup: SVGGElement;
  private ghostGroup: SVGGElement;
  private selectionGroup: SVGGElement;

  constructor(
    private svgRoot: SVGSVGElement,
    private view: ViewTransform,
    private doc: CircuitDocument,
    private componentRegistry: ComponentRegistry,
    private selection: SelectionState,
  ) {
    this.contentGroup = createGroup('content');
    this.wiresGroup = createGroup('wires');
    this.componentsGroup = createGroup('components');
    this.ghostGroup = createGroup('ghost');
    this.selectionGroup = createGroup('selection');

    this.contentGroup.appendChild(this.wiresGroup);
    this.contentGroup.appendChild(this.componentsGroup);
    this.contentGroup.appendChild(this.selectionGroup);
    this.contentGroup.appendChild(this.ghostGroup);
    this.svgRoot.appendChild(this.contentGroup);
  }

  render(): void {
    this.contentGroup.setAttribute('transform', this.view.toSvgTransform());
    this.renderWires();
    this.renderComponents();
    this.renderSelection();
  }

  // ====== WIRES ======

  private renderWires(): void {
    this.wiresGroup.innerHTML = '';
    for (const wire of this.doc.wires) {
      this.wiresGroup.appendChild(this.buildWireGroup(wire, WIRE_COLOR));
    }
  }

  private buildWireGroup(wire: WireInstance, color: string): SVGGElement {
    const g = createGroup('wire');
    g.dataset.id = wire.id;
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = wire.points[i];
      const b = wire.points[i + 1];
      g.appendChild(createLine(
        a.x * GRID_SIZE, a.y * GRID_SIZE,
        b.x * GRID_SIZE, b.y * GRID_SIZE,
        { stroke: color, 'stroke-width': WIRE_WIDTH, 'stroke-linecap': 'round' },
      ));
    }
    for (const [idx, mark] of wire.junctions) {
      if (!wire.points[idx]) continue;
      const p = wire.points[idx];
      if (mark === 'dot') {
        g.appendChild(createCircle(p.x * GRID_SIZE, p.y * GRID_SIZE, 3, { fill: color }));
      } else if (mark === 'open') {
        g.appendChild(createCircle(p.x * GRID_SIZE, p.y * GRID_SIZE, 3, {
          fill: 'white', stroke: color, 'stroke-width': 1.5,
        }));
      }
    }
    return g;
  }

  // ====== COMPONENTS ======

  private renderComponents(): void {
    this.componentsGroup.innerHTML = '';
    for (const comp of this.doc.components) {
      const def = this.componentRegistry.get(comp.defId);
      if (!def) continue;
      const g = this.renderOneComponent(comp, def);
      if (g) this.componentsGroup.appendChild(g);
    }
  }

  private renderOneComponent(comp: ComponentInstance, def: ComponentDef): SVGGElement | null {
    if (comp.type === 'bipole') return this.renderBipole(comp, def, false);
    if (comp.type === 'monopole') return this.renderMonopole(comp, def, false);
    if (comp.type === 'node') return this.renderNode(comp, def, false);
    return null;
  }

  /**
   * Render a bipole (path-type component) between two grid points.
   *
   * Strategy:
   *  - The SVG symbol contains only the component body (no lead lines).
   *  - We render the symbol at a fixed natural scale (body ≈ 2 grid units wide).
   *  - The symbol is rotated and centered along the start→end axis.
   *  - SVG lead lines are drawn from (sx,sy) to the symbol's START pin,
   *    and from the symbol's END pin to (ex,ey).
   */
  private renderBipole(comp: BipoleInstance, def: ComponentDef, isGhost: boolean): SVGGElement {
    const sx = comp.start.x * GRID_SIZE;
    const sy = comp.start.y * GRID_SIZE;
    const ex = comp.end.x * GRID_SIZE;
    const ey = comp.end.y * GRID_SIZE;

    const dx = ex - sx;
    const dy = ey - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

    // Fixed scale: body renders at ~2 grid units wide regardless of placement distance.
    // symbolPinSpan is the body width in SVG pts; we map it to 2*GRID_SIZE pixels.
    const BODY_GRID_UNITS = 2;
    const bodyPx = BODY_GRID_UNITS * GRID_SIZE;
    const scale = bodyPx / def.symbolPinSpan;

    // In symbol coordinates, START pin absolute x = refX - symbolPinSpan/2
    const pinStartAbsX = def.symbolRefX - def.symbolPinSpan / 2;
    const pinEndAbsX   = def.symbolRefX + def.symbolPinSpan / 2;

    // After scaling, START pin is at pinStartAbsX*scale from symbol origin,
    // END pin is at pinEndAbsX*scale.
    const pinStartPx = pinStartAbsX * scale;
    const pinEndPx   = pinEndAbsX   * scale;
    const refYPx     = def.symbolRefY * scale;

    // Body is placed centered along the start→end axis.
    // The center of the body (in scaled symbol coords) is refX*scale.
    // We want the body center to align with the midpoint of the component.
    // In rotated local coords (along axis):
    //   midpoint along axis = dist/2
    //   symbol center = refX*scale
    // So we offset the symbol origin along axis by: dist/2 - refX*scale

    const refXPx = def.symbolRefX * scale;
    const axisOffset = dist / 2 - refXPx;

    // Lead lines in local (rotated) coords:
    //   from (0, 0) to (axisOffset + pinStartPx, 0)      — lead to START
    //   from (axisOffset + pinEndPx, 0) to (dist, 0)     — lead from END
    const leadEndStart = axisOffset + pinStartPx;
    const leadStartEnd = axisOffset + pinEndPx;

    const color = isGhost ? SELECTION_COLOR : WIRE_COLOR;

    const g = createGroup(isGhost ? 'ghost-bipole' : 'component bipole');
    if (!isGhost) {
      g.dataset.id = comp.id;
      g.dataset.defId = comp.defId;
    }

    // Outer group: translate to start, rotate along component axis
    g.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${angleDeg})`);

    // Lead line: start → symbol START pin
    if (leadEndStart > 0.5) {
      g.appendChild(createLine(0, 0, leadEndStart, 0, {
        stroke: color, 'stroke-width': WIRE_WIDTH, 'stroke-linecap': 'round',
      }));
    }

    // Lead line: symbol END pin → end
    if (dist - leadStartEnd > 0.5) {
      g.appendChild(createLine(leadStartEnd, 0, dist, 0, {
        stroke: color, 'stroke-width': WIRE_WIDTH, 'stroke-linecap': 'round',
      }));
    }

    // Symbol group: translate to symbol origin position, then scale
    const symG = document.createElementNS(SVG_NS, 'g');
    symG.setAttribute('transform', `translate(${axisOffset}, ${-refYPx}) scale(${scale})`);

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', `#${def.symbolId}`);
    if (isGhost) {
      useEl.setAttribute('stroke', SELECTION_COLOR);
      useEl.setAttribute('fill', 'none');
    }
    symG.appendChild(useEl);
    g.appendChild(symG);

    // Label above midpoint (world coords, outside transforms)
    if (!isGhost && comp.props.label) {
      this.appendBipoleLabel(g, comp, def, scale, angleDeg);
    }

    return g;
  }

  private appendBipoleLabel(
    g: SVGGElement,
    comp: BipoleInstance,
    def: ComponentDef,
    scale: number,
    angleDeg: number,
  ): void {
    const mx = (comp.start.x + comp.end.x) / 2 * GRID_SIZE;
    const my = (comp.start.y + comp.end.y) / 2 * GRID_SIZE;

    const angleRad = angleDeg * Math.PI / 180;
    const perpX = -Math.sin(angleRad);
    const perpY = Math.cos(angleRad);
    const offset = def.viewBoxH * scale * 0.5 + 6;

    // Label lives in a separate world-coord group to escape the rotation transform
    const labelG = document.createElementNS(SVG_NS, 'g');
    labelG.setAttribute('transform',
      `translate(${mx + perpX * offset}, ${my + perpY * offset}) rotate(${-angleDeg})`
    );
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-family', 'serif');
    text.setAttribute('fill', '#000');
    text.textContent = comp.props.label || '';
    labelG.appendChild(text);
    g.appendChild(labelG);
  }

  /**
   * Render a monopole (node placed at a single point, like ground).
   * The symbol's reference point (refX, refY) maps to the grid position.
   */
  private renderMonopole(comp: MonopoleInstance, def: ComponentDef, isGhost: boolean): SVGGElement {
    const wx = comp.position.x * GRID_SIZE;
    const wy = comp.position.y * GRID_SIZE;

    // Scale: we want the symbol to appear at a reasonable size.
    // Base the scale on viewBoxH: target height = 1.5 grid units
    const targetHeightPx = GRID_SIZE * 1.5;
    const scale = targetHeightPx / def.viewBoxH;

    const g = createGroup(isGhost ? 'ghost-monopole' : 'component monopole');
    if (!isGhost) {
      g.dataset.id = comp.id;
      g.dataset.defId = comp.defId;
    }

    // Translate so that the reference point (refX*scale, refY*scale) lands at (wx, wy)
    const tx = wx - def.symbolRefX * scale;
    const ty = wy - def.symbolRefY * scale;

    g.setAttribute('transform',
      `translate(${tx}, ${ty}) rotate(${comp.rotation}, ${def.symbolRefX * scale}, ${def.symbolRefY * scale}) scale(${scale})`
    );

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', `#${def.symbolId}`);
    if (isGhost) {
      useEl.setAttribute('stroke', SELECTION_COLOR);
    }
    g.appendChild(useEl);
    return g;
  }

  private renderNode(comp: NodeInstance, def: ComponentDef, isGhost: boolean): SVGGElement {
    const wx = comp.position.x * GRID_SIZE;
    const wy = comp.position.y * GRID_SIZE;

    // Nodes: scale based on a standard size — 2 grid units wide
    const targetWidthPx = GRID_SIZE * 3;
    const scale = targetWidthPx / def.viewBoxW;

    const g = createGroup(isGhost ? 'ghost-node' : 'component node');
    if (!isGhost) {
      g.dataset.id = comp.id;
      g.dataset.defId = comp.defId;
    }

    const tx = wx - def.symbolRefX * scale;
    const ty = wy - def.symbolRefY * scale;

    g.setAttribute('transform',
      `translate(${tx}, ${ty}) scale(${scale})`
    );

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', `#${def.symbolId}`);
    if (isGhost) useEl.setAttribute('stroke', SELECTION_COLOR);
    g.appendChild(useEl);
    return g;
  }

  // ====== SELECTION ======

  private renderSelection(): void {
    this.selectionGroup.innerHTML = '';
    const ids = this.selection.getSelectedIds();
    for (const id of ids) {
      const el = this.componentsGroup.querySelector(`[data-id="${id}"]`) as SVGGElement | null;
      if (!el) {
        const wireEl = this.wiresGroup.querySelector(`[data-id="${id}"]`) as SVGGElement | null;
        if (wireEl) {
          const clone = wireEl.cloneNode(true) as SVGGElement;
          clone.querySelectorAll('line').forEach(line => {
            setAttrs(line, { stroke: SELECTION_COLOR, 'stroke-width': WIRE_WIDTH + 2 });
          });
          this.selectionGroup.appendChild(clone);
        }
        continue;
      }
      try {
        const bbox = el.getBBox();
        const rect = createSvgElement('rect', {
          x: bbox.x - 3,
          y: bbox.y - 3,
          width: bbox.width + 6,
          height: bbox.height + 6,
          fill: 'none',
          stroke: SELECTION_COLOR,
          'stroke-width': 1.5,
          'stroke-dasharray': '4',
          rx: 2,
        });
        this.selectionGroup.appendChild(rect);
      } catch {
        // getBBox can throw if element is not in DOM
      }
    }
  }

  // ====== GHOST ======

  setGhostElement(el: SVGElement | null): void {
    this.ghostGroup.innerHTML = '';
    if (el) {
      el.setAttribute('opacity', String(GHOST_OPACITY));
      this.ghostGroup.appendChild(el);
    }
  }

  buildBipoleGhost(defId: string, start: { x: number; y: number }, end: { x: number; y: number }): SVGGElement | null {
    const def = this.componentRegistry.get(defId);
    if (!def) return null;
    const fake: BipoleInstance = {
      id: '__ghost__', defId, type: 'bipole',
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      props: {},
    };
    return this.renderBipole(fake, def, true);
  }

  buildWireGhost(points: { x: number; y: number }[]): SVGGElement | null {
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

  buildMonopoleGhost(defId: string, position: { x: number; y: number }, rotation: number = 0): SVGGElement | null {
    const def = this.componentRegistry.get(defId);
    if (!def) return null;
    const fake: MonopoleInstance = {
      id: '__ghost__', defId, type: 'monopole',
      position: { x: position.x, y: position.y },
      rotation: rotation as 0,
      props: {},
    };
    return this.renderMonopole(fake, def, true);
  }

  // ====== HIT TESTING ======

  hitTest(worldX: number, worldY: number): string | null {
    const screenX = worldX * this.view.zoom + this.view.panX;
    const screenY = worldY * this.view.zoom + this.view.panY;
    const rect = this.svgRoot.getBoundingClientRect();
    const clientX = rect.left + screenX;
    const clientY = rect.top + screenY;

    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      const g = (el as HTMLElement).closest('[data-id]') as HTMLElement | null;
      if (g?.dataset.id && g.dataset.id !== '__ghost__') return g.dataset.id;
    }
    return null;
  }
}
