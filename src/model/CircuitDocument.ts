import type { ComponentInstance, WireInstance, DocumentMetadata } from '../types';
import { GRID_SIZE, SNAP_GRID, DEFAULT_STYLE } from '../constants';

export class CircuitDocument {
  components: ComponentInstance[] = [];
  wires: WireInstance[] = [];
  metadata: DocumentMetadata;

  constructor(style: 'european' | 'american' = DEFAULT_STYLE) {
    this.metadata = {
      style,
      gridSize: GRID_SIZE,
      snapSize: SNAP_GRID,
      scale: 1,
    };
  }

  addComponent(c: ComponentInstance): void {
    this.components.push(c);
  }

  removeComponent(id: string): void {
    this.components = this.components.filter(c => c.id !== id);
  }

  getComponent(id: string): ComponentInstance | undefined {
    return this.components.find(c => c.id === id);
  }

  addWire(w: WireInstance): void {
    this.wires.push(w);
  }

  removeWire(id: string): void {
    this.wires = this.wires.filter(w => w.id !== id);
  }

  getWire(id: string): WireInstance | undefined {
    return this.wires.find(w => w.id === id);
  }

  clear(): void {
    this.components = [];
    this.wires = [];
  }
}
