import type { ComponentDef, ToolType } from '../types';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import type { ToolManager } from '../tools/ToolManager';
import type { EventBus } from '../utils/events';

// Order of groups in the palette
const GROUP_ORDER = [
  'Resistive bipoles',
  'Capacitive and dynamic bipoles',
  'Inductors',
  'Diodes',
  'Sources and generators',
  'Switches, buttons and jumpers',
  'Grounds and supply voltages',
  'Amplifiers',
  'Block diagram',
  'Logic gates',
  'RF components',
  'Instruments',
  'Wiring',
  'Mechanical',
  'Miscellaneous',
  'Tubes',
];

export class ComponentPalette {
  private container: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private allDefs: ComponentDef[] = [];
  private searchInput!: HTMLInputElement;
  private listContainer!: HTMLElement;

  constructor(
    parent: HTMLElement,
    private registry: ComponentRegistry,
    private toolManager: ToolManager,
    private eventBus: EventBus,
  ) {
    this.container = parent;
    this.allDefs = this.registry.getAll();
    this.build();

    this.eventBus.on('tool-changed', () => this.updateActiveState());
  }

  private build(): void {
    // Search box
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search component…';
    this.searchInput.className = 'palette-search';
    this.searchInput.addEventListener('input', () => this.applyFilter());
    this.container.appendChild(this.searchInput);

    // Scrollable list
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'palette-list';
    this.container.appendChild(this.listContainer);

    this.renderList(this.allDefs);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      for (const def of this.allDefs) {
        if (def.shortcut === key) {
          e.preventDefault();
          this.selectComponent(def);
          return;
        }
      }
      if (key === 'w') {
        e.preventDefault();
        this.toolManager.setTool('wire');
      }
    });
  }

  private applyFilter(): void {
    const q = this.searchInput.value.trim().toLowerCase();
    const filtered = q
      ? this.allDefs.filter(d =>
          d.displayName.toLowerCase().includes(q) ||
          d.tikzName.toLowerCase().includes(q) ||
          (d.group ?? '').toLowerCase().includes(q)
        )
      : this.allDefs;
    this.renderList(filtered);
  }

  private renderList(defs: ComponentDef[]): void {
    this.listContainer.innerHTML = '';
    this.buttons.clear();

    // Group by group field
    const groups = new Map<string, ComponentDef[]>();
    for (const def of defs) {
      const g = def.group ?? 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(def);
    }

    // Render in defined order, then any leftover groups
    const orderedGroups = [
      ...GROUP_ORDER.filter(g => groups.has(g)),
      ...[...groups.keys()].filter(g => !GROUP_ORDER.includes(g)),
    ];

    for (const groupName of orderedGroups) {
      const groupDefs = groups.get(groupName)!;

      const title = document.createElement('div');
      title.className = 'category-title';
      title.textContent = groupName;
      this.listContainer.appendChild(title);

      for (const def of groupDefs) {
        const btn = document.createElement('button');
        btn.className = 'comp-btn';
        btn.dataset.defId = def.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'comp-name';
        nameSpan.textContent = def.displayName;
        btn.appendChild(nameSpan);

        if (def.shortcut) {
          const sc = document.createElement('span');
          sc.className = 'shortcut';
          sc.textContent = def.shortcut.toUpperCase();
          btn.appendChild(sc);
        }

        btn.addEventListener('click', () => this.selectComponent(def));
        this.buttons.set(def.id, btn);
        this.listContainer.appendChild(btn);
      }
    }

    this.updateActiveState();
  }

  private selectComponent(def: ComponentDef): void {
    const toolType: ToolType = def.placementType === 'bipole'
      ? 'place-bipole'
      : def.placementType === 'monopole'
        ? 'place-monopole'
        : 'place-node';
    this.toolManager.setTool(toolType, def.id);
  }

  private updateActiveState(): void {
    const currentDefId = this.toolManager.currentDefId;
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle('active', id === currentDefId);
    }
  }
}
