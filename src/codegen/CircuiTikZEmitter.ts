import type { ComponentInstance, BipoleInstance, MonopoleInstance, WireInstance, TerminalMark } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import { formatCoord } from './CoordFormatter';
import { formatLabel } from './LabelFormatter';

export class CircuiTikZEmitter {
  constructor(private registry: ComponentRegistry) {}

  emit(doc: CircuitDocument): string {
    const lines: string[] = [];

    lines.push(`\\begin{tikzpicture}`);

    // Emit wires
    const wireLines = doc.wires.map(w => this.emitWire(w)).filter(Boolean);
    if (wireLines.length > 0) {
      for (const wl of wireLines) lines.push(`  ${wl}`);
    }

    // Emit bipoles
    const bipoles = doc.components.filter(c => c.type === 'bipole') as BipoleInstance[];
    for (const comp of bipoles) {
      const def = this.registry.get(comp.defId);
      if (!def) continue;
      lines.push(`  ${this.emitBipole(comp, def.tikzName)}`);
    }

    // Emit monopoles
    const monopoles = doc.components.filter(c => c.type === 'monopole') as MonopoleInstance[];
    for (const comp of monopoles) {
      const def = this.registry.get(comp.defId);
      if (!def) continue;
      lines.push(`  ${this.emitMonopole(comp, def.tikzName)}`);
    }

    lines.push(`\\end{tikzpicture}`);
    return lines.join('\n');
  }

  private emitBipole(comp: BipoleInstance, tikzName: string): string {
    const start = formatCoord(comp.start);
    const end = formatCoord(comp.end);

    const options: string[] = [tikzName];

    // Terminal markers
    const termStr = this.terminalString(comp.props.startTerminal, comp.props.endTerminal);
    if (termStr !== '-') {
      options.push(termStr);
    }

    // Label
    if (comp.props.label) {
      options.push(`l=${formatLabel(comp.props.label)}`);
    }

    // Voltage annotation
    if (comp.props.voltage) {
      options.push(`v=${formatLabel(comp.props.voltage)}`);
    }

    // Current annotation
    if (comp.props.current) {
      options.push(`i=${formatLabel(comp.props.current)}`);
    }

    return `\\draw ${start} to[${options.join(', ')}] ${end};`;
  }

  private emitMonopole(comp: MonopoleInstance, tikzName: string): string {
    const pos = formatCoord(comp.position);
    return `\\draw ${pos} node[${tikzName}] {};`;
  }

  private emitWire(wire: WireInstance): string {
    if (wire.points.length < 2) return '';
    const coords = wire.points.map(p => formatCoord(p));
    return `\\draw ${coords.join(' -- ')};`;
  }

  private terminalString(start?: TerminalMark, end?: TerminalMark): string {
    const s = start === 'dot' ? '*' : start === 'open' ? 'o' : '';
    const e = end === 'dot' ? '*' : end === 'open' ? 'o' : '';
    return `${s}-${e}`;
  }
}
