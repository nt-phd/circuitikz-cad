import type { GridPoint } from '../types';
import { SNAP_GRID } from '../constants';
import { scaleState } from './ScaleState';

export class SnapEngine {
  snapToGrid(raw: GridPoint): GridPoint {
    return {
      x: Math.round(raw.x / SNAP_GRID) * SNAP_GRID,
      y: Math.round(raw.y / SNAP_GRID) * SNAP_GRID,
    };
  }

  snapWorldToGrid(worldX: number, worldY: number): GridPoint {
    const gs = scaleState.effectiveGridSize;
    return {
      x: Math.round((worldX / gs) / SNAP_GRID) * SNAP_GRID,
      y: Math.round((worldY / gs) / SNAP_GRID) * SNAP_GRID,
    };
  }
}
