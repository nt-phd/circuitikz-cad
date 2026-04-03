import { symbolsDB } from './data/symbolsDB';
import { populateRegistryFromSymbolsDB } from './definitions/fromSymbolsDB';

import { CircuitDocument } from './model/CircuitDocument';
import { SelectionState } from './model/SelectionState';
import { EventBus } from './utils/events';
import { registry } from './definitions/ComponentRegistry';
import { SvgCanvas } from './canvas/SvgCanvas';
import { ToolManager } from './tools/ToolManager';
import { CircuiTikZEmitter } from './codegen/CircuiTikZEmitter';
import { Toolbar } from './ui/Toolbar';
import { ComponentPalette } from './ui/ComponentPalette';
import { PropertyPanel } from './ui/PropertyPanel';
import { CodePanel } from './ui/CodePanel';
import { StatusBar } from './ui/StatusBar';
import type { ToolContext } from './tools/BaseTool';

async function init() {
  // Load CircuiTikZ symbols SVG into DOM and populate registry
  await symbolsDB.load('/src/data/symbols.svg');
  populateRegistryFromSymbolsDB(registry, symbolsDB);

  // 1. Create model
  const doc = new CircuitDocument('european');
  const selection = new SelectionState();
  const eventBus = new EventBus();

  // 2. Create canvas
  const canvasContainer = document.getElementById('canvas-container')!;
  const svgCanvas = new SvgCanvas(canvasContainer, doc, registry, selection);

  // 3. Create tool context
  const toolCtx: ToolContext = {
    renderer: svgCanvas.renderer,
    emit: (e) => eventBus.emit(e),
    getDocument: () => doc,
  };

  // 4. Create tool manager
  const toolManager = new ToolManager(toolCtx, svgCanvas, selection, (e) => eventBus.emit(e));

  // 5. Create UI panels
  new Toolbar(
    document.getElementById('toolbar')!,
    toolManager,
    eventBus,
    doc,
  );

  new ComponentPalette(
    document.getElementById('palette')!,
    registry,
    toolManager,
    eventBus,
  );

  new PropertyPanel(
    document.getElementById('props')!,
    doc,
    selection,
    eventBus,
    registry,
  );

  const emitter = new CircuiTikZEmitter(registry);
  new CodePanel(
    document.getElementById('code-panel')!,
    emitter,
    doc,
    eventBus,
  );

  const statusBar = new StatusBar(
    document.getElementById('status-bar')!,
    svgCanvas.view,
    toolManager,
    eventBus,
  );

  // 6. Wire up global re-render on document changes
  eventBus.on('document-changed', () => svgCanvas.refresh());

  // 7. Mouse move for status bar
  svgCanvas.svgRoot.addEventListener('mousemove', (e) => {
    const gridPt = svgCanvas.eventToGrid(e);
    statusBar.updateCoords(gridPt);
  });

  // 8. Window resize handler
  window.addEventListener('resize', () => svgCanvas.refresh());
}

init().catch(console.error);
