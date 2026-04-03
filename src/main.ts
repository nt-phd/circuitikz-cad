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
import { parseCircuiTikZ } from './codegen/CircuiTikZParser';
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

/**
 * Merge CAD-generated \draw lines into the existing body.
 *
 * The body is a tikzpicture block. CAD components are kept in a delimited
 * section between two comment markers so they can be replaced without
 * touching the user's hand-written TikZ.
 *
 * If the markers don't exist yet (first CAD placement), they are appended
 * just before \end{tikzpicture}.
 */
const CAD_BEGIN = '% --- CAD BEGIN ---';
const CAD_END   = '% --- CAD END ---';

function mergeCadIntoBody(body: string, cadLines: string[]): string {
  const cadBlock = cadLines.length > 0
    ? `${CAD_BEGIN}\n${cadLines.map(l => `  ${l}`).join('\n')}\n${CAD_END}`
    : `${CAD_BEGIN}\n${CAD_END}`;

  if (body.includes(CAD_BEGIN)) {
    // Replace existing CAD block
    return body.replace(
      new RegExp(`${CAD_BEGIN}[\\s\\S]*?${CAD_END}`),
      cadBlock,
    );
  }

  // Insert before \end{tikzpicture}
  return body.replace(/\\end\{tikzpicture\}/, `${cadBlock}\n\\end{tikzpicture}`);
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
   * CAD tool mutated circuitDoc.
   * Merge the generated \draw lines into the CAD section of the body,
   * leaving the user's hand-written TikZ untouched.
   */
  eventBus.on('document-changed', () => {
    const cadLines = emitter.emitLines(circuitDoc);
    latexDoc.body = mergeCadIntoBody(latexDoc.body, cadLines);
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  });

  /**
   * User finished typing in CodePanel (debounced).
   * Parse whatever is in the body into circuitDoc so hit-test / drag work
   * for any components the parser recognises.
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
