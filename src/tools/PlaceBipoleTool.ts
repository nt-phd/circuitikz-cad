import type { GridPoint, BipoleInstance, ComponentProps } from '../types';
import { BaseTool } from './BaseTool';
import { uid } from '../utils/uid';
import { pointsEqual } from '../utils/geometry';
import { registry } from '../definitions/ComponentRegistry';

export class PlaceBipoleTool extends BaseTool {
  private defId: string;
  private startPoint: GridPoint | null = null;

  constructor(ctx: import('./BaseTool').ToolContext, defId: string) {
    super(ctx);
    this.defId = defId;
  }

  activate(): void {
    // Show crosshair cursor
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) {
      // Right-click: cancel current placement
      this.startPoint = null;
      this.ctx.ghost.setGhostElement(null);
      return;
    }

    if (!this.startPoint) {
      // First click: set start point
      this.startPoint = gridPt;
    } else {
      // Second click: place component
      if (pointsEqual(this.startPoint, gridPt)) return;

      const def = registry.get(this.defId);
      const defaultProps: ComponentProps = def ? { ...def.defaultProps } : { label: '' };

      const comp: BipoleInstance = {
        id: uid('comp'),
        defId: this.defId,
        type: 'bipole',
        start: { ...this.startPoint },
        end: { ...gridPt },
        props: defaultProps,
      };

      this.ctx.getDocument().addComponent(comp);
      this.ctx.emit({ type: 'component-added', component: comp });

      // Reset for next placement (sticky!)
      this.startPoint = null;
      this.ctx.ghost.setGhostElement(null);
    }
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    if (this.startPoint) {
      if (pointsEqual(this.startPoint, gridPt)) {
        this.ctx.ghost.setGhostElement(null);
        return;
      }
      const ghost = this.ctx.ghost.buildBipoleGhost(this.defId, this.startPoint, gridPt);
      this.ctx.ghost.setGhostElement(ghost);
    }
  }

  onMouseUp(_gridPt: GridPoint, _e: MouseEvent): void {
    // Not used for click-based placement
  }

  deactivate(): void {
    this.startPoint = null;
    super.deactivate();
  }
}
