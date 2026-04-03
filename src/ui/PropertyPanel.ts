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
    this.eventBus.on('document-changed', () => this.render());
  }

  private render(): void {
    this.container.innerHTML = '';

    const ids = this.selection.getSelectedIds();
    if (ids.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'Seleziona un componente per modificarne le proprietà';
      this.container.appendChild(hint);
      return;
    }

    if (ids.length > 1) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = `${ids.length} elementi selezionati`;
      this.container.appendChild(hint);
      return;
    }

    const comp = this.doc.getComponent(ids[0]);
    if (!comp) {
      // Might be a wire
      const wire = this.doc.getWire(ids[0]);
      if (wire) {
        this.renderWireProps(wire.id);
      }
      return;
    }

    this.renderComponentProps(comp);
  }

  private renderComponentProps(comp: ComponentInstance): void {
    const def = this.registry.get(comp.defId);

    // Header
    const h3 = document.createElement('h3');
    h3.textContent = def?.displayName || comp.defId;
    this.container.appendChild(h3);

    // Label
    this.addTextInput('Etichetta (label)', comp.props.label || '', (val) => {
      comp.props.label = val;
      this.emitChange(comp.id, { label: val });
    });

    // Value
    this.addTextInput('Valore', comp.props.value || '', (val) => {
      comp.props.value = val;
      this.emitChange(comp.id, { value: val });
    });

    // Voltage annotation
    this.addTextInput('Tensione (v=)', comp.props.voltage || '', (val) => {
      comp.props.voltage = val;
      this.emitChange(comp.id, { voltage: val });
    });

    // Current annotation
    this.addTextInput('Corrente (i=)', comp.props.current || '', (val) => {
      comp.props.current = val;
      this.emitChange(comp.id, { current: val });
    });

    // Terminal markers (bipoles only)
    if (comp.type === 'bipole') {
      this.addTerminalSelect('Terminale iniziale', comp.props.startTerminal || 'none', (val) => {
        comp.props.startTerminal = val;
        this.emitChange(comp.id, { startTerminal: val });
      });
      this.addTerminalSelect('Terminale finale', comp.props.endTerminal || 'none', (val) => {
        comp.props.endTerminal = val;
        this.emitChange(comp.id, { endTerminal: val });
      });
    }

    // Rotation (monopoles)
    if (comp.type === 'monopole') {
      this.addRotationButtons(comp as MonopoleInstance);
    }
  }

  private renderWireProps(wireId: string): void {
    const h3 = document.createElement('h3');
    h3.textContent = 'Filo';
    this.container.appendChild(h3);

    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.marginTop = '10px';
    hint.textContent = `ID: ${wireId}`;
    this.container.appendChild(hint);
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
    input.placeholder = label.includes('label') ? '$R_1$' : '';
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
      ['none', 'Nessuno (-)'],
      ['dot', 'Punto (*)'],
      ['open', 'Aperto (o)'],
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
    lbl.textContent = 'Rotazione';
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

  private emitChange(id: string, props: Partial<ComponentProps>): void {
    this.eventBus.emit({ type: 'component-props-changed', id, props });
  }
}
