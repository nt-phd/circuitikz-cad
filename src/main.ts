import { symbolsDB } from './data/symbolsDB';
import { populateRegistryFromSymbolsDB } from './definitions/fromSymbolsDB';

import { LatexDocument } from './model/LatexDocument';
import { CircuitDocument } from './model/CircuitDocument';
import { SelectionState } from './model/SelectionState';
import { EventBus } from './utils/events';
import { registry } from './definitions/ComponentRegistry';
import { LatexCanvas } from './canvas/LatexCanvas';
import { ToolManager } from './tools/ToolManager';
import { Toolbar } from './ui/Toolbar';
import { ComponentPalette } from './ui/ComponentPalette';
import { PropertyPanel } from './ui/PropertyPanel';
import { CodePanel } from './ui/CodePanel';
import { StatusBar } from './ui/StatusBar';
import { parseCircuiTikZ, lineIndexFromId } from './codegen/CircuiTikZParser';
import { extractTikzScale, scaleState } from './canvas/ScaleState';
import type { ToolContext } from './tools/BaseTool';

function initCollapsibleSections(): void {
  document.querySelectorAll('.rpanel-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const sectionBody = header.nextElementSibling as HTMLElement | null;
      const chevron = header.querySelector('.rpanel-chevron') as HTMLElement | null;
      if (!sectionBody) return;
      const collapsed = sectionBody.classList.toggle('rpanel-section-body--collapsed');
      if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
    });
  });
}

function appendLineToBody(body: string, line: string): string {
  const marker = '\\end{tikzpicture}';
  const idx = body.lastIndexOf(marker);
  if (idx === -1) return body + '\n' + line;
  return body.slice(0, idx) + '  ' + line + '\n' + body.slice(idx);
}

async function init() {
  initCollapsibleSections();

  await symbolsDB.load('/src/data/symbols.svg');
  populateRegistryFromSymbolsDB(registry, symbolsDB);

  const latexDoc   = new LatexDocument();
  const circuitDoc = new CircuitDocument('european');
  const selection  = new SelectionState();
  const eventBus   = new EventBus();

  const canvasContainer = document.getElementById('canvas-container')!;
  const canvas = new LatexCanvas(canvasContainer, latexDoc, circuitDoc, registry, selection);

  const syncTikzScale = () => {
    scaleState.tikzScale = extractTikzScale(latexDoc.body);
    canvas.updateGridScale();
  };

  syncTikzScale();

  const toolCtx: ToolContext = {
    ghost: canvas.ghost,
    hitTester: canvas.hitTester,
    emit: (e) => eventBus.emit(e),
    getDocument: () => circuitDoc,
    getDef: (defId: string) => registry.get(defId),
    appendLine: (line: string) => {
      latexDoc.body = appendLineToBody(latexDoc.body, line);
      syncTikzScale();
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
      eventBus.emit({ type: 'body-changed' });
      canvas.refresh();
      canvas.scheduleRender();
    },
  };

  const toolManager = new ToolManager(toolCtx, canvas, selection, (e) => eventBus.emit(e));

  new Toolbar(document.getElementById('toolbar')!, toolManager, eventBus, circuitDoc, latexDoc);
  new ComponentPalette(document.getElementById('palette')!, registry, toolManager, eventBus);

  const propPanel = new PropertyPanel(
    document.getElementById('props')!,
    circuitDoc, selection, eventBus, registry,
  );

  const codePanel = new CodePanel(
    document.getElementById('preamble-panel')!,
    document.getElementById('document-panel')!,
    latexDoc, eventBus,
  );

  propPanel.setCodePanel(codePanel, latexDoc);

  const statusBar = new StatusBar(
    document.getElementById('status-bar')!,
    canvas.view, toolManager, eventBus,
  );

  // Selection changed → highlight line in CodePanel
  eventBus.on('selection-changed', (e) => {
    if (e.type !== 'selection-changed') return;
    selection.setSelectedIds(e.selectedIds);
    canvas.refresh(); // redraw selection overlay

    const ids = e.selectedIds;
    if (ids.length !== 1) return;
    const lineIdx = lineIndexFromId(ids[0]);
    if (lineIdx >= 0 && e.source !== 'code') codePanel.highlightLine(lineIdx);
  });

  eventBus.on('code-caret-changed', (e) => {
    if (e.type !== 'code-caret-changed') return;
    const id = `line:${e.lineIndex}`;
    const selectedIds = (circuitDoc.getComponent(id) || circuitDoc.getWire(id)) ? [id] : [];
    eventBus.emit({ type: 'selection-changed', selectedIds, source: 'code' });
  });

  // document-changed: SelectTool drag completed or Delete
  eventBus.on('document-changed', () => {
    canvas.refresh();
    canvas.scheduleRender();
  });

  // user-edited-latex: user typed in textarea
  eventBus.on('user-edited-latex', () => {
    syncTikzScale();
    parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    selection.clear();
    canvas.refresh();
    canvas.scheduleRender();
  });

  syncTikzScale();
  parseCircuiTikZ(latexDoc.body, circuitDoc, registry);

  canvas.overlaySvg.addEventListener('mousemove', (e) => {
    statusBar.updateCoords(canvas.eventToGridRaw(e));
  });

  window.addEventListener('resize', () => canvas.refresh());
  canvas.scheduleRender();
}

init().catch(console.error);
