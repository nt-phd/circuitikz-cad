import type { GridPoint } from '../types';

/**
 * Formats grid coordinates as CircuiTikZ coordinate strings.
 * SVG uses Y-down, TikZ uses Y-up → we negate Y.
 */
export function formatCoord(p: GridPoint): string {
  const tx = p.x;
  const ty = -p.y; // flip Y for TikZ
  const fx = Number.isInteger(tx) ? tx.toString() : tx.toFixed(1);
  const fy = Number.isInteger(ty) ? ty.toString() : ty.toFixed(1);
  return `(${fx},${fy})`;
}
