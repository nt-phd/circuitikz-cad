/**
 * LatexCanvas — the main canvas that uses LaTeX as the sole renderer.
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
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';
import { ViewTransform } from './ViewTransform';
import { SnapEngine } from './SnapEngine';
import { GhostRenderer } from './GhostRenderer';
import { HitTester } from './HitTester';
import { PanZoomHandler } from './PanZoomHandler';
import {
  GRID_SIZE, TIKZ_PT_PER_UNIT, RENDER_SERVER_URL, RENDER_DEBOUNCE_MS,
  MAJOR_GRID_EVERY, GRID_COLOR_MINOR, GRID_COLOR_MAJOR,
  ZOOM_STEP, MIN_ZOOM, MAX_ZOOM,
} from '../constants';
import { createSvgElement, setAttrs } from '../utils/svg';

const SVG_NS = 'http://www.w3.org/2000/svg';
// pt-to-px scale at zoom=1: GRID_SIZE px per TikZ unit, 1 TikZ unit = TIKZ_PT_PER_UNIT pt
const PT_TO_PX = GRID_SIZE / TIKZ_PT_PER_UNIT;

export class LatexCanvas {
  readonly view: ViewTransform;
  readonly snap: SnapEngine;
  readonly ghost: GhostRenderer;
  readonly hitTester: HitTester;

  private worldDiv: HTMLDivElement;
  private latexDiv: HTMLDivElement;
  readonly overlaySvg: SVGSVGElement;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private serverAvailable = true;

  // Grid SVG elements
  private patternMinor!: SVGPatternElement;
  private patternMajor!: SVGPatternElement;
  private gridRect!: SVGRectElement;

  // Pan/zoom (operates on the overlay, updates worldDiv CSS)
  private spaceHeld = false;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(
    private container: HTMLElement,
    private doc: CircuitDocument,
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

    this.hitTester = new HitTester(doc);
    this.ghost = new GhostRenderer(this.overlaySvg, doc, registry, selection);

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
    this.updateGrid();
    this.ghost.renderSelection();
  }

  scheduleRender(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.doRender(), RENDER_DEBOUNCE_MS);
  }

  // Force immediate render (skip debounce)
  renderNow(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.doRender();
  }

  get isCurrentlyPanning(): boolean {
    return this.isPanning || this.spaceHeld;
  }

  // ====== LATEX RENDER ======

  private async doRender(): Promise<void> {
    this.debounceTimer = null;

    // Build latex from emitter (injected via callback to avoid circular deps)
    const latex = this.latexCallback?.();
    if (!latex) return;

    try {
      const res = await fetch(`${RENDER_SERVER_URL}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json() as { svg?: string; tx?: number; ty?: number; error?: string };
      if (data.svg) {
        this.injectSvg(data.svg, data.tx ?? 0, data.ty ?? 0);
        this.serverAvailable = true;
      } else {
        console.warn('[LatexCanvas] render error:', data.error);
      }
    } catch (e) {
      this.serverAvailable = false;
      console.warn('[LatexCanvas] server unreachable:', e);
    }
  }

  private latexCallback: (() => string) | null = null;

  /** Register the function that produces the current LaTeX source. */
  setLatexCallback(fn: () => string): void {
    this.latexCallback = fn;
  }

  private injectSvg(svgText: string, tx: number, ty: number): void {
    this.latexDiv.innerHTML = svgText;
    const svgEl = this.latexDiv.querySelector('svg');
    if (!svgEl) return;

    // Parse viewBox dimensions (in pt)
    const vb = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number);
    if (vb && vb.length >= 4) {
      const wPx = vb[2] * PT_TO_PX;
      const hPx = vb[3] * PT_TO_PX;
      svgEl.style.width = wPx + 'px';
      svgEl.style.height = hPx + 'px';
    }
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.style.overflow = 'visible';

    // Align TikZ(0,0) with world origin (0,0)
    // In the SVG, TikZ origin is at (tx, ty) pt → (tx*PT_TO_PX, ty*PT_TO_PX) px
    this.latexDiv.style.left = (-tx * PT_TO_PX) + 'px';
    this.latexDiv.style.top  = (-ty * PT_TO_PX) + 'px';
  }

  // ====== GRID ======

  private buildGrid(): void {
    const defs = createSvgElement('defs') as SVGDefsElement;

    // Dot-grid: one pattern tile of GRID_SIZE × GRID_SIZE.
    // Minor dots at every grid point, major dots every MAJOR_GRID_EVERY units.
    // The overlay is inside worldDiv so CSS transform already handles pan+zoom —
    // pattern coordinates stay fixed in world space.
    const majorSize = GRID_SIZE * MAJOR_GRID_EVERY;

    // Minor dot pattern (one dot per tile, at origin = top-left corner of tile)
    this.patternMinor = createSvgElement('pattern', {
      id: 'lc-grid-minor', patternUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: GRID_SIZE, height: GRID_SIZE,
    }) as SVGPatternElement;
    this.patternMinor.appendChild(createSvgElement('circle', {
      cx: 0, cy: 0, r: 0.75,
      fill: GRID_COLOR_MINOR,
    }));
    defs.appendChild(this.patternMinor);

    // Major dot pattern: fills with minor dots, then overlays a larger dot every N units
    this.patternMajor = createSvgElement('pattern', {
      id: 'lc-grid-major', patternUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: majorSize, height: majorSize,
    }) as SVGPatternElement;
    this.patternMajor.appendChild(createSvgElement('rect', {
      x: 0, y: 0, width: majorSize, height: majorSize,
      fill: 'url(#lc-grid-minor)',
    }));
    // Larger dot at each major intersection (corners of the major tile)
    this.patternMajor.appendChild(createSvgElement('circle', {
      cx: 0, cy: 0, r: 1.5,
      fill: GRID_COLOR_MAJOR,
    }));
    defs.appendChild(this.patternMajor);

    this.overlaySvg.appendChild(defs);

    // Cover a large area in world coordinates so the grid is always visible
    // regardless of pan. The CSS transform handles the actual viewport mapping.
    const BIG = 20000;
    this.gridRect = createSvgElement('rect', {
      x: -BIG, y: -BIG, width: BIG * 2, height: BIG * 2,
      fill: 'url(#lc-grid-major)',
    }) as SVGRectElement;
    this.overlaySvg.insertBefore(this.gridRect, this.overlaySvg.firstChild);
  }

  // Grid is static in world coords — CSS transform handles pan/zoom.
  // This method is kept for resize events that need to refresh other elements.
  private updateGrid(): void {}

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
