import type { ComponentInstance, ComponentDef, ConnectionRef, GridPoint, SymbolPin } from '../types';
import { getPlacedComponentMetrics } from './ComponentGeometry';
import { pickPrimaryPin } from './ComponentProbeService';

function projectPin(position: GridPoint, rotation: number, localX: number, localY: number): GridPoint {
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: position.x + localX * cos - localY * sin,
    y: position.y + localX * sin + localY * cos,
  };
}

function getSemanticPins(def: ComponentDef): SymbolPin[] {
  const pins = [...(def.symbolPins ?? [])];
  if (def.scaleFamily === 'amplifiers' && !pins.some((pin) => pin.name === 'out')) {
    const bboxX = def.shapeBBoxX ?? 0;
    const bboxW = def.shapeBBoxW ?? def.viewBoxW;
    pins.push({
      name: 'out',
      x: bboxX + bboxW - def.symbolRefX,
      y: 0,
    });
  }
  return pins;
}

export function getComponentAnchorPoints(comp: ComponentInstance, def: ComponentDef): Array<{ point: GridPoint; ref?: ConnectionRef }> {
  if (comp.type === 'bipole') {
    return [
      { point: comp.start },
      { point: comp.end },
    ];
  }

  const pins = getSemanticPins(def);
  const nodeName = comp.nodeName;
  const { scale } = getPlacedComponentMetrics(def, 1);
  const anchorPins = pins.length > 0 ? pins : [{ name: 'reference', x: 0, y: 0 }];

  return anchorPins.map((pin) => ({
    point: projectPin(comp.position, comp.rotation ?? 0, pin.x * scale, pin.y * scale),
    ref: nodeName ? { componentId: comp.id, nodeName, anchor: pin.name } : undefined,
  }));
}

export function getPrimaryAnchorRef(comp: ComponentInstance, def: ComponentDef): ConnectionRef | null {
  if (comp.type === 'bipole' || !comp.nodeName) return null;
  const nodeName = comp.nodeName;
  const pins = getSemanticPins(def);
  const primary = pickPrimaryPin(pins);
  return primary
    ? { componentId: comp.id, nodeName, anchor: primary.name }
    : { componentId: comp.id, nodeName, anchor: 'reference' };
}
