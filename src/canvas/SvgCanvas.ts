import type { GridPoint, ScreenPoint } from '../types';
import { createSvgElement } from '../utils/svg';
import { ViewTransform } from './ViewTransform';
import { Grid } from './Grid';
import { SnapEngine } from './SnapEngine';
import { Renderer } from './Renderer';
import { PanZoomHandler } from './PanZoomHandler';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { SelectionState } from '../model/SelectionState';

export class SvgCanvas {
  readonly svgRoot: SVGSVGElement;
  readonly view: ViewTransform;
  readonly grid: Grid;
  readonly panZoom: PanZoomHandler;
  readonly renderer: Renderer;
  readonly snap: SnapEngine;
  private container: HTMLElement;

  constructor(container: HTMLElement, doc: CircuitDocument, registry: ComponentRegistry, selection: SelectionState) {
    this.container = container;
    this.svgRoot = createSvgElement('svg', { width: '100%', height: '100%' });
    container.appendChild(this.svgRoot);

    const defs = createSvgElement('defs');
    this.svgRoot.appendChild(defs);

    this.view = new ViewTransform();
    this.grid = new Grid(defs, this.svgRoot);
    this.snap = new SnapEngine();
    this.renderer = new Renderer(this.svgRoot, this.view, doc, registry, selection);

    this.panZoom = new PanZoomHandler(this.svgRoot, this.view, () => this.refresh());

    // Center the view: pan so grid origin is near center of viewport
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      this.view.pan(rect.width / 2, rect.height / 2);
      this.refresh();
    });
  }

  eventToGrid(e: MouseEvent): GridPoint {
    const rect = this.svgRoot.getBoundingClientRect();
    const screen: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return this.view.screenToGrid(screen);
  }

  eventToGridRaw(e: MouseEvent): GridPoint {
    const rect = this.svgRoot.getBoundingClientRect();
    const screen: ScreenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = this.view.screenToWorld(screen);
    return this.view.worldToGrid(world);
  }

  refresh(): void {
    const rect = this.container.getBoundingClientRect();
    this.grid.update(this.view, rect.width, rect.height);
    this.renderer.render();
  }
}
