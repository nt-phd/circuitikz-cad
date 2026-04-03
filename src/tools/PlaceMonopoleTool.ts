import type { GridPoint, MonopoleInstance, Rotation } from '../types';
import { BaseTool } from './BaseTool';
import { uid } from '../utils/uid';
import { registry } from '../definitions/ComponentRegistry';

export class PlaceMonopoleTool extends BaseTool {
  private defId: string;
  private rotation: Rotation = 0;

  constructor(ctx: import('./BaseTool').ToolContext, defId: string) {
    super(ctx);
    this.defId = defId;
  }

  onMouseDown(gridPt: GridPoint, e: MouseEvent): void {
    if (e.button !== 0) {
      this.ctx.renderer.setGhostElement(null);
      return;
    }

    const def = registry.get(this.defId);
    const comp: MonopoleInstance = {
      id: uid('comp'),
      defId: this.defId,
      type: 'monopole',
      position: { ...gridPt },
      rotation: this.rotation,
      props: def ? { ...def.defaultProps } : {},
    };

    this.ctx.getDocument().addComponent(comp);
    this.ctx.emit({ type: 'component-added', component: comp });
    // Sticky: stay in tool, ready for next placement
  }

  onMouseMove(gridPt: GridPoint, _e: MouseEvent): void {
    const ghost = this.ctx.renderer.buildMonopoleGhost(this.defId, gridPt, this.rotation);
    this.ctx.renderer.setGhostElement(ghost);
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
