import type { GridPoint } from '../types';
import { GRID_SIZE } from '../constants';

export class SnapEngine {
  snapToGrid(raw: GridPoint): GridPoint {
    return {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
    };
  }

  snapWorldToGrid(worldX: number, worldY: number): GridPoint {
    return {
      x: Math.round(worldX / GRID_SIZE),
      y: Math.round(worldY / GRID_SIZE),
    };
  }
}
