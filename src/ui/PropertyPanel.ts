import type { ComponentInstance, ComponentProps, TerminalMark, Rotation, MonopoleInstance } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { SelectionState } from '../model/SelectionState';
import type { EventBus } from '../utils/events';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';

export class PropertyPanel {
  private container: HTMLElement;

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

  private render(): void {
    this.container.innerHTML = '';

    const ids = this.selection.getSelectedIds();
    if (ids.length === 0) {
      this.hint('Select a component to edit its properties');
      return;
    }
    if (ids.length > 1) {
      this.hint(`${ids.length} elements selected`);
      return;
    }

    const comp = this.doc.getComponent(ids[0]);
    if (!comp) {
      const wire = this.doc.getWire(ids[0]);
      if (wire) this.renderWireProps(wire.id);
      return;
    }
    this.renderComponentProps(comp);
  }

  private hint(text: string): void {
    const div = document.createElement('div');
    div.className = 'empty-hint';
    div.textContent = text;
    this.container.appendChild(div);
  }

  private renderComponentProps(comp: ComponentInstance): void {
    const def = this.registry.get(comp.defId);

    const h3 = document.createElement('h3');
    h3.textContent = def?.displayName ?? comp.defId;
    this.container.appendChild(h3);

    this.addTextInput('Label', comp.props.label ?? '', (val) => {
      comp.props.label = val;
      this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { label: val } });
    });
    this.addTextInput('Value', comp.props.value ?? '', (val) => {
      comp.props.value = val;
      this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { value: val } });
    });
    this.addTextInput('Voltage (v=)', comp.props.voltage ?? '', (val) => {
      comp.props.voltage = val;
      this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { voltage: val } });
    });
    this.addTextInput('Current (i=)', comp.props.current ?? '', (val) => {
      comp.props.current = val;
      this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { current: val } });
    });

    if (comp.type === 'bipole') {
      this.addTerminalSelect('Start terminal', comp.props.startTerminal ?? 'none', (val) => {
        comp.props.startTerminal = val;
        this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { startTerminal: val } });
      });
      this.addTerminalSelect('End terminal', comp.props.endTerminal ?? 'none', (val) => {
        comp.props.endTerminal = val;
        this.eventBus.emit({ type: 'component-props-changed', id: comp.id, props: { endTerminal: val } });
      });
    }

    if (comp.type === 'monopole') {
      this.addRotationButtons(comp as MonopoleInstance);
    }
  }

  private renderWireProps(wireId: string): void {
    const h3 = document.createElement('h3');
    h3.textContent = 'Wire';
    this.container.appendChild(h3);
    const div = document.createElement('div');
    div.className = 'empty-hint';
    div.style.marginTop = '10px';
    div.textContent = `ID: ${wireId}`;
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
    input.addEventListener('input', () => onChange(input.value));
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
    const options: [TerminalMark, string][] = [
      ['none', 'None (-)'], ['dot', 'Dot (*)'], ['open', 'Open (o)'],
    ];
    for (const [val, text] of options) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      opt.selected = val === value;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => onChange(select.value as TerminalMark));
    group.appendChild(select);
    this.container.appendChild(group);
  }

  private addRotationButtons(comp: MonopoleInstance): void {
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
        this.eventBus.emit({ type: 'document-changed' });
      });
      btnsDiv.appendChild(btn);
    }
    group.appendChild(btnsDiv);
    this.container.appendChild(group);
  }
}
