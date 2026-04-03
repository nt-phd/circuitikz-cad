import type { GridPoint, ScreenPoint } from '../types';
import { GRID_SIZE, MIN_ZOOM, MAX_ZOOM } from '../constants';

export class ViewTransform {
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1.0;

  get panX(): number { return this._panX; }
  get panY(): number { return this._panY; }
  get zoom(): number { return this._zoom; }

  screenToWorld(screen: ScreenPoint): { x: number; y: number } {
    return {
      x: (screen.x - this._panX) / this._zoom,
      y: (screen.y - this._panY) / this._zoom,
    };
  }

  worldToGrid(world: { x: number; y: number }): GridPoint {
    return {
      x: world.x / GRID_SIZE,
      y: world.y / GRID_SIZE,
    };
  }

  screenToGrid(screen: ScreenPoint): GridPoint {
    const world = this.screenToWorld(screen);
    const raw = this.worldToGrid(world);
    return { x: Math.round(raw.x), y: Math.round(raw.y) };
  }

  gridToScreen(grid: GridPoint): ScreenPoint {
    return {
      x: grid.x * GRID_SIZE * this._zoom + this._panX,
      y: grid.y * GRID_SIZE * this._zoom + this._panY,
    };
  }

  gridToWorld(grid: GridPoint): { x: number; y: number } {
    return { x: grid.x * GRID_SIZE, y: grid.y * GRID_SIZE };
  }

  pan(dx: number, dy: number): void {
    this._panX += dx;
    this._panY += dy;
  }

  zoomAt(screenPt: ScreenPoint, factor: number): void {
    const oldZoom = this._zoom;
    this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoom * factor));
    const ratio = this._zoom / oldZoom;
    this._panX = screenPt.x - ratio * (screenPt.x - this._panX);
    this._panY = screenPt.y - ratio * (screenPt.y - this._panY);
  }

  toSvgTransform(): string {
    return `translate(${this._panX}, ${this._panY}) scale(${this._zoom})`;
  }

  get zoomPercent(): number {
    return Math.round(this._zoom * 100);
  }
}
