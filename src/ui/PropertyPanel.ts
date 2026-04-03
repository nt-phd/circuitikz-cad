import type { ComponentInstance, ComponentProps, TerminalMark, Rotation, MonopoleInstance, BipoleInstance } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { SelectionState } from '../model/SelectionState';
import type { EventBus } from '../utils/events';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { CodePanel } from './CodePanel';
import type { LatexDocument } from '../model/LatexDocument';
import { lineIndexFromId } from '../codegen/CircuiTikZParser';
import { formatCoord } from '../codegen/CoordFormatter';
import { formatLabel } from '../codegen/LabelFormatter';

export class PropertyPanel {
  private container: HTMLElement;
  private codePanel: CodePanel | null = null;
  private latexDoc: LatexDocument | null = null;

  constructor(
    parent: HTMLElement,
    private doc: CircuitDocument,
    private selection: SelectionState,
    private eventBus: EventBus,
    private registry: ComponentRegistry,
  ) {
    this.container = parent;
    this.render();
    this.eventBus.on('selection-changed', () => this.render());
    this.eventBus.on('document-changed',  () => this.render());
  }

  /** Wire up CodePanel and LatexDocument after construction. */
  setCodePanel(cp: CodePanel, ld: LatexDocument): void {
    this.codePanel = cp;
    this.latexDoc = ld;
  }

  private render(): void {
    this.container.innerHTML = '';
    const ids = this.selection.getSelectedIds();

    if (ids.length === 0) { this.hint('Select a component to edit its properties'); return; }
    if (ids.length > 1)   { this.hint(`${ids.length} elements selected`); return; }

    const id = ids[0];
    const comp = this.doc.getComponent(id);
    if (!comp) {
      const wire = this.doc.getWire(id);
      if (wire) { this.hint('Wire — edit in Document panel'); }
      return;
    }
    this.renderComponentProps(comp);
  }

  private renderComponentProps(comp: ComponentInstance): void {
    const def = this.registry.get(comp.defId);
    const lineIdx = lineIndexFromId(comp.id);

    const h3 = document.createElement('h3');
    h3.textContent = def?.displayName ?? comp.defId;
    this.container.appendChild(h3);

    // Helper: when a prop changes, rebuild the source line and replace it
    const onPropChange = () => {
      if (lineIdx < 0 || !this.latexDoc || !this.codePanel) return;
      const newLine = this.buildSourceLine(comp);
      if (newLine) this.codePanel.replaceLine(lineIdx, newLine);
    };

    this.addTextInput('Label', comp.props.label ?? '', (val) => {
      comp.props.label = val || undefined;
      onPropChange();
    });
    this.addTextInput('Value', comp.props.value ?? '', (val) => {
      comp.props.value = val || undefined;
      onPropChange();
    });
    this.addTextInput('Voltage (v=)', comp.props.voltage ?? '', (val) => {
      comp.props.voltage = val || undefined;
      onPropChange();
    });
    this.addTextInput('Current (i=)', comp.props.current ?? '', (val) => {
      comp.props.current = val || undefined;
      onPropChange();
    });

    if (comp.type === 'bipole') {
      this.addTerminalSelect('Start terminal', comp.props.startTerminal ?? 'none', (val) => {
        comp.props.startTerminal = val;
        onPropChange();
      });
      this.addTerminalSelect('End terminal', comp.props.endTerminal ?? 'none', (val) => {
        comp.props.endTerminal = val;
        onPropChange();
      });
    }

    if (comp.type === 'monopole') {
      this.addRotationButtons(comp as MonopoleInstance, onPropChange);
    }
  }

  /** Reconstruct the LaTeX source line from a component's current props. */
  private buildSourceLine(comp: ComponentInstance): string | null {
    const tikzName = this.registry.get(comp.defId)?.tikzName ?? comp.defId;
    if (comp.type === 'bipole') {
      const b = comp as BipoleInstance;
      const opts: string[] = [tikzName];
      const ts = b.props.startTerminal === 'dot' ? '*' : b.props.startTerminal === 'open' ? 'o' : '';
      const te = b.props.endTerminal   === 'dot' ? '*' : b.props.endTerminal   === 'open' ? 'o' : '';
      const term = `${ts}-${te}`;
      if (term !== '-') opts.push(term);
      if (b.props.label)   opts.push(`l=${formatLabel(b.props.label)}`);
      if (b.props.voltage) opts.push(`v=${formatLabel(b.props.voltage)}`);
      if (b.props.current) opts.push(`i=${formatLabel(b.props.current)}`);
      return `  \\draw ${formatCoord(b.start)} to[${opts.join(', ')}] ${formatCoord(b.end)};`;
    }
    if (comp.type === 'monopole') {
      const m = comp as MonopoleInstance;
      return `  \\draw ${formatCoord(m.position)} node[${tikzName}] {};`;
    }
    return null;
  }

  private hint(text: string): void {
    const div = document.createElement('div');
    div.className = 'empty-hint';
    div.textContent = text;
    this.container.appendChild(div);
  }

  private addTextInput(label: string, value: string, onChange: (val: string) => void): void {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    group.appendChild(lbl);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = label === 'Label' ? '$R_1$' : '';
    input.addEventListener('change', () => onChange(input.value));
    group.appendChild(input);
    this.container.appendChild(group);
  }

  private addTerminalSelect(label: string, value: TerminalMark, onChange: (val: TerminalMark) => void): void {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    group.appendChild(lbl);
    const select = document.createElement('select');
    for (const [val, text] of [['none','None (-)'],['dot','Dot (*)'],['open','Open (o)']] as [TerminalMark, string][]) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = text; opt.selected = val === value;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => onChange(select.value as TerminalMark));
    group.appendChild(select);
    this.container.appendChild(group);
  }

  private addRotationButtons(comp: MonopoleInstance, onPropChange: () => void): void {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const lbl = document.createElement('label');
    lbl.textContent = 'Rotation';
    group.appendChild(lbl);
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'rotation-btns';
    for (const rot of [0, 90, 180, 270] as Rotation[]) {
      const btn = document.createElement('button');
      btn.textContent = `${rot}°`;
      if (comp.rotation === rot) btn.style.fontWeight = 'bold';
      btn.addEventListener('click', () => {
        comp.rotation = rot;
        onPropChange();
      });
      btnsDiv.appendChild(btn);
    }
    group.appendChild(btnsDiv);
    this.container.appendChild(group);
  }
}
