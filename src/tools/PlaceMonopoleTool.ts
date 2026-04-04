import type { GridPoint, Rotation } from '../types';
import { BaseTool } from './BaseTool';
import { formatCoord } from '../codegen/CoordFormatter';
import { componentProbeService, pickPrimaryPin } from '../canvas/ComponentProbeService';
import { SNAP_GRID } from '../constants';
import { scaleState } from '../canvas/ScaleState';

export class PlaceMonopoleTool extends BaseTool {
  private rotation: Rotation = 0;

  constructor(ctx: import('./BaseTool').ToolContext, private defId: string) {
    super(ctx);
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) {
      this.ctx.ghost.setGhostElement(null);
      return;
    }
    const def = this.ctx.getDef(this.defId);
    const tikzName = this.ctx.getDef(this.defId)?.tikzName ?? this.defId;
    const nodeName = this.ctx.getDocument().nextNodeName();
    let placementPt = gridPt;
    if (def) {
      const probe = componentProbeService.getPlacedGhostProbe(def, this.rotation, () => {});
      const primaryPin = probe ? pickPrimaryPin(probe.pinOffsets) : null;
      if (primaryPin) {
        placementPt = {
          x: gridPt.x - primaryPin.x / scaleState.effectiveGridSize,
          y: gridPt.y - primaryPin.y / scaleState.effectiveGridSize,
        };
        placementPt = {
          x: Math.round(placementPt.x / SNAP_GRID) * SNAP_GRID,
          y: Math.round(placementPt.y / SNAP_GRID) * SNAP_GRID,
        };
      }
    }
    this.ctx.appendLine(`\\node[${tikzName}](${nodeName}) at ${formatCoord(placementPt)} {};`);
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    const ghost = this.ctx.ghost.buildMonopoleGhost(this.defId, gridPt, this.rotation);
    this.ctx.ghost.setGhostElement(ghost);
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'r' || e.key === 'R') {
      this.rotation = ((this.rotation + 90) % 360) as Rotation;
    }
  }

  deactivate(): void {
    this.rotation = 0;
    super.deactivate();
  }
}
