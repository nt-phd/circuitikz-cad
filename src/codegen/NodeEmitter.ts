import { formatCoord } from './CoordFormatter';
import type { ComponentInstance } from '../types';

export function emitPlacedNodeLine(comp: ComponentInstance, tikzName: string): string | null {
  if (comp.type !== 'node' && comp.type !== 'monopole') return null;
  const optionParts = [tikzName];
  const extraOptions = (comp.props.options ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('rotate='));
  if (comp.rotation) extraOptions.push(`rotate=${comp.rotation}`);
  if (extraOptions.length > 0) optionParts.push(extraOptions.join(', '));
  const nodeName = comp.nodeName ? `(${comp.nodeName})` : '';
  const base = `\\node[${optionParts.join(', ')}]${nodeName} at ${formatCoord(comp.position)}{}`
  if (comp.nodeName && comp.props.text) {
    const anchor = comp.props.textAnchor || 'center';
    return `${base} node[anchor=${anchor}] at (${comp.nodeName}.text){${comp.props.text}};`;
  }
  return `${base};`;
}
