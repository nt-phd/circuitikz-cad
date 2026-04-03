import { symbolsDB } from './data/symbolsDB';
import { populateRegistryFromSymbolsDB } from './definitions/fromSymbolsDB';

import { LatexDocument } from './model/LatexDocument';
import { CircuitDocument } from './model/CircuitDocument';
import { SelectionState } from './model/SelectionState';
import { EventBus } from './utils/events';
import { registry } from './definitions/ComponentRegistry';
import { LatexCanvas } from './canvas/LatexCanvas';
import { ToolManager } from './tools/ToolManager';
import { CircuiTikZEmitter } from './codegen/CircuiTikZEmitter';
import { Toolbar } from './ui/Toolbar';
import { ComponentPalette } from './ui/ComponentPalette';
import { PropertyPanel } from './ui/PropertyPanel';
import { CodePanel } from './ui/CodePanel';
import { StatusBar } from './ui/StatusBar';
import type { ToolContext } from './tools/BaseTool';

// ── Right-panel collapsible sections ──────────────────────────────────────────
function initCollapsibleSections(): void {
  document.querySelectorAll('.rpanel-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling as HTMLElement | null;
      const chevron = header.querySelector('.rpanel-chevron') as HTMLElement | null;
      if (!body) return;
      const collapsed = body.classList.toggle('rpanel-section-body--collapsed');
      if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
    });
  });
}

async function init() {
  initCollapsibleSections();

  await symbolsDB.load('/src/data/symbols.svg');
  populateRegistryFromSymbolsDB(registry, symbolsDB);

  const latexDoc   = new LatexDocument();
  const circuitDoc = new CircuitDocument('european');
  const selection  = new SelectionState();
  const eventBus   = new EventBus();
  const emitter    = new CircuiTikZEmitter(registry);

  const canvasContainer = document.getElementById('canvas-container')!;
  const canvas = new LatexCanvas(canvasContainer, latexDoc, circuitDoc, registry, selection);

  const toolCtx: ToolContext = {
    ghost: canvas.ghost,
    hitTester: canvas.hitTester,
    emit: (e) => eventBus.emit(e),
    getDocument: () => circuitDoc,
  };

  const toolManager = new ToolManager(toolCtx, canvas, selection, (e) => eventBus.emit(e));

  new Toolbar(document.getElementById('toolbar')!, toolManager, eventBus, circuitDoc, latexDoc);
  new ComponentPalette(document.getElementById('palette')!, registry, toolManager, eventBus);
  new PropertyPanel(document.getElementById('props')!, circuitDoc, selection, eventBus, registry);

  new CodePanel(
    document.getElementById('preamble-panel')!,
    document.getElementById('document-panel')!,
    latexDoc,
    eventBus,
  );

  const statusBar = new StatusBar(
    document.getElementById('status-bar')!,
    canvas.view, toolManager, eventBus,
  );

  /**
   * CAD tool mutated circuitDoc → regenerate latexDoc.body → sync CodePanel → render.
   * Does NOT parse body back into circuitDoc (that would overwrite what was just added).
   */
  eventBus.on('document-changed', () => {
    latexDoc.body = emitter.emit(circuitDoc);
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  });

  /**
   * User finished typing in CodePanel (debounced).
   * latexDoc.preamble / latexDoc.body are already up to date.
   * Just recompile — do NOT touch circuitDoc.
   */
  eventBus.on('user-edited-latex', () => {
    canvas.scheduleRender();
  });

  canvas.overlaySvg.addEventListener('mousemove', (e) => {
    statusBar.updateCoords(canvas.eventToGridRaw(e));
  });

  window.addEventListener('resize', () => canvas.refresh());

  canvas.scheduleRender();
}

init().catch(console.error);
