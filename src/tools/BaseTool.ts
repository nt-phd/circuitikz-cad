import type { GridPoint } from '../types';
import type { Renderer } from '../canvas/Renderer';

export interface ToolContext {
  renderer: Renderer;
  emit: (event: import('../types').AppEvent) => void;
  getDocument: () => import('../model/CircuitDocument').CircuitDocument;
}

export abstract class BaseTool {
  constructor(protected ctx: ToolContext) {}

  abstract onMouseDown(gridPt: GridPoint, e: MouseEvent): void;
  abstract onMouseMove(gridPt: GridPoint, e: MouseEvent): void;
  abstract onMouseUp(gridPt: GridPoint, e: MouseEvent): void;

  onKeyDown(_e: KeyboardEvent): void {}

  activate(): void {}

  deactivate(): void {
    this.ctx.renderer.setGhostElement(null);
  }
}
