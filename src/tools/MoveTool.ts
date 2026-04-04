import type { GridPoint } from '../types';
import { BaseTool } from './BaseTool';

export class MoveTool extends BaseTool {
  onMouseDown(_gridPt: GridPoint, _e: MouseEvent): void {}
  onMouseMove(_gridPt: GridPoint, _e: MouseEvent): void {}
  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {}
}
