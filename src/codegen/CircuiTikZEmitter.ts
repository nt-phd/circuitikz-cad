import type { BipoleInstance, MonopoleInstance, NodeInstance, WireInstance, TerminalMark, DrawingInstance } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import { formatCoord } from './CoordFormatter';
import { formatLabel } from './LabelFormatter';
import { emitWirePath } from './WirePathEmitter';

/**
 * Emits the tikzpicture body (without \begin/\end) from a CircuitDocument.
 * Used by tools to regenerate the LatexDocument body after model changes.
 */
export class CircuiTikZEmitter {
  constructor(private registry: ComponentRegistry) {}

  /** Emit a full \begin{tikzpicture}…\end{tikzpicture} block. */
  emit(doc: CircuitDocument): string {
    const lines: string[] = [];
    lines.push(`\\begin{tikzpicture}`);
    for (const l of this.emitLines(doc)) lines.push(`  ${l}`);
    lines.push(`\\end{tikzpicture}`);
    return lines.join('\n');
  }

  /** Emit only the inner \draw lines (no begin/end wrapper). */
  emitLines(doc: CircuitDocument): string[] {
    const lines: string[] = [];

    for (const w of doc.wires) {
      const l = this.emitWire(w);
      if (l) lines.push(l);
    }

    for (const drawing of doc.drawings) {
      const l = this.emitDrawing(drawing);
      if (l) lines.push(l);
    }

    for (const comp of doc.components) {
      if (comp.type === 'bipole') {
        const def = this.registry.get(comp.defId);
        if (def) lines.push(this.emitBipole(comp, def.tikzName));
      } else if (comp.type === 'monopole') {
        const def = this.registry.get(comp.defId);
        if (def) lines.push(this.emitPlacedNode(comp, def.tikzName));
      } else if (comp.type === 'node') {
        const def = this.registry.get(comp.defId);
        if (def) lines.push(this.emitPlacedNode(comp, def.tikzName));
      }
    }

    return lines;
  }

  private emitBipole(comp: BipoleInstance, tikzName: string): string {
    const start = formatCoord(comp.start);
    const end = formatCoord(comp.end);
    const options: string[] = [tikzName];

    const termStr = this.terminalString(comp.props.startTerminal, comp.props.endTerminal);
    if (termStr !== '-') options.push(termStr);
    if (comp.props.label)   options.push(`l=${formatLabel(comp.props.label)}`);
    if (comp.props.voltage) options.push(`v=${formatLabel(comp.props.voltage)}`);
    if (comp.props.current) options.push(`i=${formatLabel(comp.props.current)}`);

    return `\\draw ${start} to[${options.join(', ')}] ${end};`;
  }

  private emitMonopole(comp: MonopoleInstance, tikzName: string): string {
    return this.emitPlacedNode(comp, tikzName);
  }

  private emitWire(wire: WireInstance): string {
    if (wire.points.length < 2) return '';
    return `\\draw ${emitWirePath(wire)};`;
  }

  private emitPlacedNode(comp: MonopoleInstance | NodeInstance, tikzName: string): string {
    const nodeName = comp.nodeName ? `(${comp.nodeName})` : '';
    return `\\node[${tikzName}]${nodeName} at ${formatCoord(comp.position)} {};`;
  }

  private emitDrawing(drawing: DrawingInstance): string {
    switch (drawing.kind) {
      case 'line':
        return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} -- ${formatCoord(drawing.end)};`;
      case 'arrow':
        return `\\draw[${drawing.props.options || '->'}] ${formatCoord(drawing.start)} -- ${formatCoord(drawing.end)};`;
      case 'text':
        return `\\node at ${formatCoord(drawing.position)} {${drawing.props.text ?? 'Text'}};`;
      case 'rectangle':
        return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} rectangle ${formatCoord(drawing.end)};`;
      case 'circle':
        return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.center)} circle (${drawing.radius});`;
      case 'bezier':
        return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} .. controls ${formatCoord(drawing.control1)} and ${formatCoord(drawing.control2)} .. ${formatCoord(drawing.end)};`;
    }
  }

  private terminalString(start?: TerminalMark, end?: TerminalMark): string {
    const s = start === 'dot' ? '*' : start === 'open' ? 'o' : '';
    const e = end === 'dot' ? '*' : end === 'open' ? 'o' : '';
    return `${s}-${e}`;
  }
}
