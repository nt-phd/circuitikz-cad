import type { GridPoint } from '../types';
import { scaleState } from './ScaleState';

export class SnapEngine {
  snapToGrid(raw: GridPoint): GridPoint {
    return {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
    };
  }

  snapWorldToGrid(worldX: number, worldY: number): GridPoint {
    const gs = scaleState.effectiveGridSize;
    return {
      x: Math.round(worldX / gs),
      y: Math.round(worldY / gs),
    };
  }
}
