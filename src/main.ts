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
import { parseCircuiTikZ } from './codegen/CircuiTikZParser';
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

/** Insert a line just before \end{tikzpicture} in the body. */
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

  const toolCtx: ToolContext = {
    ghost: canvas.ghost,
    hitTester: canvas.hitTester,
    emit: (e) => eventBus.emit(e),
    getDocument: () => circuitDoc,

    /** Append a LaTeX line to the body and trigger render. */
    appendLine: (line: string) => {
      latexDoc.body = appendLineToBody(latexDoc.body, line);
      eventBus.emit({ type: 'body-changed' });   // sync textarea
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry); // keep hit-test in sync
      canvas.refresh();
      canvas.scheduleRender();
    },
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
   * document-changed: emitted by SelectTool (drag) and DeleteTool.
   * These still modify circuitDoc directly, so we re-parse and re-render.
   * NOTE: for these tools we do NOT regenerate the body from the model —
   * drag/delete on parsed components is a best-effort feature.
   */
  eventBus.on('document-changed', () => {
    canvas.refresh();
    canvas.scheduleRender();
  });

  /**
   * user-edited-latex: user finished typing in the Document or Preamble textarea.
   * Re-parse body into circuitDoc and recompile.
   */
  eventBus.on('user-edited-latex', () => {
    parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    selection.clear();
    canvas.refresh();
    canvas.scheduleRender();
  });

  // Populate circuitDoc from the default body at startup.
  parseCircuiTikZ(latexDoc.body, circuitDoc, registry);

  canvas.overlaySvg.addEventListener('mousemove', (e) => {
    statusBar.updateCoords(canvas.eventToGridRaw(e));
  });

  window.addEventListener('resize', () => canvas.refresh());

  canvas.scheduleRender();
}

init().catch(console.error);
