import type { GridPoint } from '../types';
import type { GhostRenderer } from '../canvas/GhostRenderer';
import type { HitTester } from '../canvas/HitTester';
import type { ComponentDef } from '../types';
import type { ClipboardPayload } from './SelectionClipboard';

export interface ToolContext {
  ghost: GhostRenderer;
  hitTester: HitTester;
  emit: (event: import('../types').AppEvent) => void;
  getDocument: () => import('../model/CircuitDocument').CircuitDocument;
  getDef: (defId: string) => ComponentDef | undefined;
  /** Append a \draw line to the tikzpicture body and trigger a render. */
  appendLine: (line: string) => void;
  /** Delete model elements and their corresponding LaTeX source lines. */
  deleteElements: (ids: string[]) => void;
  placeClipboard: (payload: ClipboardPayload, target: GridPoint) => void;
  undo: () => void;
}

export abstract class BaseTool {
  constructor(protected ctx: ToolContext) {}

  abstract onMouseDown(gridPt: GridPoint, e: MouseEvent): void;
  abstract onMouseMove(gridPt: GridPoint, e: MouseEvent): void;
  abstract onMouseUp(gridPt: GridPoint, e: MouseEvent): void;

  onKeyDown(_e: KeyboardEvent): void {}
  activate(): void {}
  deactivate(): void { this.ctx.ghost.setGhostElement(null); }
}
