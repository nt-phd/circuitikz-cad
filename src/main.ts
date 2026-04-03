import { symbolsDB } from './data/symbolsDB';
import { populateRegistryFromSymbolsDB } from './definitions/fromSymbolsDB';

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

async function init() {
  await symbolsDB.load('/src/data/symbols.svg');
  populateRegistryFromSymbolsDB(registry, symbolsDB);

  const doc = new CircuitDocument('european');
  const selection = new SelectionState();
  const eventBus = new EventBus();

  const canvasContainer = document.getElementById('canvas-container')!;
  const canvas = new LatexCanvas(canvasContainer, doc, registry, selection);

  const emitter = new CircuiTikZEmitter(registry);
  canvas.setLatexCallback(() => emitter.emit(doc));

  const toolCtx: ToolContext = {
    ghost: canvas.ghost,
    hitTester: canvas.hitTester,
    emit: (e) => eventBus.emit(e),
    getDocument: () => doc,
  };

  const toolManager = new ToolManager(toolCtx, canvas, selection, (e) => eventBus.emit(e));

  new Toolbar(document.getElementById('toolbar')!, toolManager, eventBus, doc);

  new ComponentPalette(document.getElementById('palette')!, registry, toolManager, eventBus);

  new PropertyPanel(document.getElementById('props')!, doc, selection, eventBus, registry);

  new CodePanel(document.getElementById('code-panel')!, emitter, doc, eventBus);

  const statusBar = new StatusBar(document.getElementById('status-bar')!, canvas.view, toolManager, eventBus);

  eventBus.on('document-changed', () => {
    canvas.refresh();
    canvas.scheduleRender();
  });

  canvas.overlaySvg.addEventListener('mousemove', (e) => {
    statusBar.updateCoords(canvas.eventToGridRaw(e));
  });

  window.addEventListener('resize', () => canvas.refresh());
}

init().catch(console.error);
