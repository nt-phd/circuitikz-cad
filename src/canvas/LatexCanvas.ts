/**
 * LatexCanvas — renders a LatexDocument by compiling it with pdflatex+pdf2svg.
 *
 * DOM structure inside `container`:
 *   div.world-transform          ← CSS transform: translate(panX,panY) scale(zoom)
 *     div.latex-layer            ← injected SVG from pdflatex+pdf2svg, pointer-events:none
 *     svg.overlay-layer          ← grid, ghost, selection — receives mouse events
 *
 * Coordinate alignment:
 *   pdf2svg SVG uses pt units with transform="matrix(1,0,0,-1,tx,ty)" on all paths.
 *   The TikZ origin (0,0) corresponds to SVG point (tx, ty).
 *   We position the latex-layer so its SVG origin aligns with the world origin.
 *   Scale factor: GRID_SIZE px = TIKZ_PT_PER_UNIT pt  (20px per TikZ unit = 1cm)
 */

import type { GridPoint, ScreenPoint } from '../types';
import type { LatexDocument } from '../model/LatexDocument';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import { ViewTransform } from './ViewTransform';
import { SnapEngine } from './SnapEngine';
import { GhostRenderer } from './GhostRenderer';
import { HitTester } from './HitTester';
import {
  GRID_SIZE, TIKZ_PT_PER_UNIT, RENDER_SERVER_URL,
  MAJOR_GRID_EVERY, GRID_COLOR_MINOR, GRID_COLOR_MAJOR,
  ZOOM_STEP,
} from '../constants';
import { scaleState } from './ScaleState';
import { createSvgElement } from '../utils/svg';

// Base pt-to-px at zoom=1, scale=1: 20px per TikZ unit, 1 TikZ unit = TIKZ_PT_PER_UNIT pt
// The actual conversion must include tikzScale: PT_TO_PX * tikzScale
const BASE_PT_TO_PX = GRID_SIZE / TIKZ_PT_PER_UNIT;

export class LatexCanvas {
  readonly view: ViewTransform;
  readonly snap: SnapEngine;
  readonly ghost: GhostRenderer;
  readonly hitTester: HitTester;

  private worldDiv: HTMLDivElement;
  private latexDiv: HTMLDivElement;
  readonly overlaySvg: SVGSVGElement;

  private renderInFlight = false;
  private renderPending = false;
  private errorBanner: HTMLDivElement | null = null;

  // Grid SVG elements
  private patternMinor!: SVGPatternElement;
  private patternMajor!: SVGPatternElement;
  private gridRect!: SVGRectElement;

  // Pan/zoom
  private spaceHeld = false;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(
    private container: HTMLElement,
    private latexDoc: LatexDocument,
    private circuitDoc: CircuitDocument,
    private registry: ComponentRegistry,
    private selection: SelectionState,
  ) {
    this.view = new ViewTransform();
    this.snap = new SnapEngine();

    // World transform div — both layers move together
    this.worldDiv = document.createElement('div');
    this.worldDiv.className = 'world-transform';
    container.appendChild(this.worldDiv);

    // LaTeX layer (pointer-events: none — mouse goes to overlay)
    this.latexDiv = document.createElement('div');
    this.latexDiv.className = 'latex-layer';
    this.worldDiv.appendChild(this.latexDiv);

    // Overlay SVG (grid + ghost + selection)
    this.overlaySvg = createSvgElement('svg', {
      class: 'overlay-layer',
      width: '100%', height: '100%',
    }) as SVGSVGElement;
    this.worldDiv.appendChild(this.overlaySvg);

    this.buildGrid();

    this.hitTester = new HitTester(circuitDoc);
    this.ghost = new GhostRenderer(this.overlaySvg, circuitDoc, registry, selection);

    this.attachPanZoom();

    // Center origin in viewport
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      this.view.pan(rect.width / 3, rect.height / 2);
      this.refresh();
    });
  }

  // ====== PUBLIC API ======

  eventToGrid(e: MouseEvent): GridPoint {
    const rect = this.container.getBoundingClientRect();
    const screen: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return this.view.screenToGrid(screen);
  }

  eventToGridRaw(e: MouseEvent): GridPoint {
    const rect = this.container.getBoundingClientRect();
    const screen: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = this.view.screenToWorld(screen);
    return this.view.worldToGrid(world);
  }

  refresh(): void {
    this.applyTransform();
    this.ghost.renderSelection();
  }

  updateGridScale(): void {
    const gs = scaleState.effectiveGridSize;
    const majorSize = gs * MAJOR_GRID_EVERY;
    this.patternMinor.setAttribute('width', String(gs));
    this.patternMinor.setAttribute('height', String(gs));
    this.patternMajor.setAttribute('width', String(majorSize));
    this.patternMajor.setAttribute('height', String(majorSize));
    const majorRect = this.patternMajor.querySelector('rect');
    if (majorRect) {
      majorRect.setAttribute('width', String(majorSize));
      majorRect.setAttribute('height', String(majorSize));
    }
  }

  /** Trigger a pdflatex render. Queues if one is already in flight. */
  scheduleRender(): void {
    if (this.renderInFlight) {
      this.renderPending = true;
      return;
    }
    this.doRender();
  }

  get isCurrentlyPanning(): boolean {
    return this.isPanning || this.spaceHeld;
  }

  // ====== LATEX RENDER ======

  private async doRender(): Promise<void> {
    this.renderInFlight = true;
    this.renderPending = false;

    const latex = this.latexDoc.toFullSource();

    try {
      const res = await fetch(`${RENDER_SERVER_URL}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json() as { svg?: string; tx?: number; ty?: number; error?: string };
      if (data.svg) {
        this.injectSvg(data.svg, data.tx ?? 0, data.ty ?? 0);
        this.showError(null);
      } else {
        console.warn('[LatexCanvas] render error:', data.error);
        this.showError(data.error ?? 'LaTeX error');
      }
    } catch (e) {
      console.warn('[LatexCanvas] server unreachable:', e);
      this.showError('Render server unreachable');
    } finally {
      this.renderInFlight = false;
      if (this.renderPending) this.doRender();
    }
  }

  private injectSvg(svgText: string, tx: number, ty: number): void {
    this.latexDiv.innerHTML = svgText;
    const svgEl = this.latexDiv.querySelector('svg');
    if (!svgEl) return;

    // pt-to-px must account for tikzpicture scale so the SVG aligns with
    // the overlay grid (which uses effectiveGridSize = GRID_SIZE × tikzScale).
    // pdflatex already bakes the scale into the pt coordinates, so we do NOT
    // divide by tikzScale here — we just use the base conversion.
    // The overlay grid tile = GRID_SIZE × tikzScale px, and the SVG pt coords
    // already represent scaled TikZ units, so BASE_PT_TO_PX is correct as-is.
    const ptToPx = BASE_PT_TO_PX;

    // Parse viewBox dimensions (in pt) and convert to px
    const vb = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number);
    if (vb && vb.length >= 4) {
      svgEl.style.width  = (vb[2] * ptToPx) + 'px';
      svgEl.style.height = (vb[3] * ptToPx) + 'px';
    }
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.style.overflow = 'visible';

    // Align TikZ(0,0) with world origin
    this.latexDiv.style.left = (-tx * ptToPx) + 'px';
    this.latexDiv.style.top  = (-ty * ptToPx) + 'px';
  }

  // ====== ERROR BANNER ======

  private showError(message: string | null): void {
    if (!message) {
      if (this.errorBanner) { this.errorBanner.remove(); this.errorBanner = null; }
      return;
    }
    if (!this.errorBanner) {
      this.errorBanner = document.createElement('div');
      this.errorBanner.className = 'latex-error-banner';
      this.container.appendChild(this.errorBanner);
    }
    // Show only the first ! error line for brevity
    const firstError = message.split('\n').find(l => l.startsWith('!')) ?? message;
    this.errorBanner.textContent = firstError.slice(0, 120);
  }

  // ====== GRID ======

  private buildGrid(): void {
    const defs = createSvgElement('defs') as SVGDefsElement;

    // Grid tile size = effectiveGridSize (GRID_SIZE × tikzScale).
    // Updated in updateGridScale() when the scale changes.
    const gs = scaleState.effectiveGridSize;
    const majorSize = gs * MAJOR_GRID_EVERY;

    this.patternMinor = createSvgElement('pattern', {
      id: 'lc-grid-minor', patternUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: gs, height: gs,
    }) as SVGPatternElement;
    this.patternMinor.appendChild(createSvgElement('circle', {
      cx: 0, cy: 0, r: 0.75, fill: GRID_COLOR_MINOR,
    }));
    defs.appendChild(this.patternMinor);

    this.patternMajor = createSvgElement('pattern', {
      id: 'lc-grid-major', patternUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: majorSize, height: majorSize,
    }) as SVGPatternElement;
    this.patternMajor.appendChild(createSvgElement('rect', {
      x: 0, y: 0, width: majorSize, height: majorSize,
      fill: 'url(#lc-grid-minor)',
    }));
    this.patternMajor.appendChild(createSvgElement('circle', {
      cx: 0, cy: 0, r: 1.5, fill: GRID_COLOR_MAJOR,
    }));
    defs.appendChild(this.patternMajor);

    this.overlaySvg.appendChild(defs);

    const BIG = 20000;
    this.gridRect = createSvgElement('rect', {
      x: -BIG, y: -BIG, width: BIG * 2, height: BIG * 2,
      fill: 'url(#lc-grid-major)',
    }) as SVGRectElement;
    this.overlaySvg.insertBefore(this.gridRect, this.overlaySvg.firstChild);
  }

  // ====== PAN/ZOOM ======

  private applyTransform(): void {
    this.worldDiv.style.transform =
      `translate(${this.view.panX}px, ${this.view.panY}px) scale(${this.view.zoom})`;
  }

  private attachPanZoom(): void {
    const el = this.overlaySvg;

    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      this.view.zoomAt(screenPt, factor);
      this.refresh();
    }, { passive: false });

    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        e.preventDefault();
        this.isPanning = true;
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        el.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isPanning) return;
      this.view.pan(e.clientX - this.lastPanX, e.clientY - this.lastPanY);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.refresh();
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (this.isPanning && (e.button === 1 || e.button === 0)) {
        this.isPanning = false;
        el.style.cursor = this.spaceHeld ? 'grab' : '';
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space') { this.spaceHeld = true; el.style.cursor = 'grab'; }
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.spaceHeld = false;
        if (!this.isPanning) el.style.cursor = '';
      }
    });
  }
}
