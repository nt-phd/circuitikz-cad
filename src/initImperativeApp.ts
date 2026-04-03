import { symbolsDB } from './data/symbolsDB';
import { populateRegistryFromSymbolsDB } from './definitions/fromSymbolsDB';

import { LatexDocument } from './model/LatexDocument';
import { CircuitDocument } from './model/CircuitDocument';
import { SelectionState } from './model/SelectionState';
import { EventBus } from './utils/events';
import { registry } from './definitions/ComponentRegistry';
import { LatexCanvas } from './canvas/LatexCanvas';
import { ToolManager } from './tools/ToolManager';
import { parseCircuiTikZ, lineIndexFromId } from './codegen/CircuiTikZParser';
import { extractTikzScale, scaleState } from './canvas/ScaleState';
import { formatCoord } from './codegen/CoordFormatter';
import { formatLabel } from './codegen/LabelFormatter';
import { DEFAULT_BODY } from './model/LatexDocument';
import type { ComponentInstance, WireInstance, TerminalMark } from './types';
import type { ToolContext } from './tools/BaseTool';

let initialized = false;
let initPromise: Promise<ImperativeAppHandle> | null = null;

function appendLineToBody(body: string, line: string): string {
  const marker = '\\end{tikzpicture}';
  const idx = body.lastIndexOf(marker);
  if (idx === -1) return body + '\n' + line;
  return body.slice(0, idx) + '  ' + line + '\n' + body.slice(idx);
}

function terminalString(start?: TerminalMark, end?: TerminalMark): string {
  const s = start === 'dot' ? '*' : start === 'open' ? 'o' : '';
  const e = end === 'dot' ? '*' : end === 'open' ? 'o' : '';
  return `${s}-${e}`;
}

function emitComponentLine(comp: ComponentInstance): string | null {
  const def = registry.get(comp.defId);
  const tikzName = def?.tikzName ?? comp.defId;
  if (comp.type === 'bipole') {
    const opts: string[] = [tikzName];
    const term = terminalString(comp.props.startTerminal, comp.props.endTerminal);
    if (term !== '-') opts.push(term);
    if (comp.props.label) opts.push(`l=${formatLabel(comp.props.label)}`);
    if (comp.props.voltage) opts.push(`v=${formatLabel(comp.props.voltage)}`);
    if (comp.props.current) opts.push(`i=${formatLabel(comp.props.current)}`);
    return `\\draw ${formatCoord(comp.start)} to[${opts.join(', ')}] ${formatCoord(comp.end)};`;
  }
  if (comp.type === 'monopole') {
    return `\\draw ${formatCoord(comp.position)} node[${tikzName}] {};`;
  }
  if (comp.type === 'node') {
    return `\\node[${tikzName}] at ${formatCoord(comp.position)} {};`;
  }
  return null;
}

function emitWireLine(wire: WireInstance): string {
  return `\\draw ${wire.points.map(formatCoord).join(' -- ')};`;
}

function updateBodyLinePreservingStructure(body: string, lineIndex: number, replacement: string, kind: 'component' | 'wire'): string {
  const lines = body.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  const original = lines[lineIndex];

  if (kind === 'component' && original.includes('\\node') && original.includes(' at ')) {
    lines[lineIndex] = original.replace(/at\s*\(\s*[-\d.]+\s*,\s*[-\d.]+\s*\)/, `at ${replacement.match(/\([^)]+\)/)?.[0] ?? ''}`);
  } else {
    const indent = original.match(/^\s*/)?.[0] ?? '';
    lines[lineIndex] = `${indent}${replacement}`;
  }

  return lines.join('\n');
}

export interface ImperativeAppHandle {
  circuitDoc: CircuitDocument;
  eventBus: EventBus;
  latexDoc: LatexDocument;
  registry: typeof registry;
  selection: SelectionState;
  toolManager: ToolManager;
  clearDocument: () => void;
}

async function createImperativeApp(canvasContainer: HTMLElement): Promise<ImperativeAppHandle> {
  if (initialized) throw new Error('Imperative app already initialized');
  initialized = true;

  await symbolsDB.load('/src/data/symbols.svg');
  populateRegistryFromSymbolsDB(registry, symbolsDB);

  const latexDoc = new LatexDocument();
  const circuitDoc = new CircuitDocument('european');
  const selection = new SelectionState();
  const eventBus = new EventBus();

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

  eventBus.on('selection-changed', (e) => {
    if (e.type !== 'selection-changed') return;
    selection.setSelectedIds(e.selectedIds);
    canvas.refresh();
  });

  eventBus.on('code-caret-changed', (e) => {
    if (e.type !== 'code-caret-changed') return;
    const id = `line:${e.lineIndex}`;
    const selectedIds = (circuitDoc.getComponent(id) || circuitDoc.getWire(id)) ? [id] : [];
    eventBus.emit({ type: 'selection-changed', selectedIds, source: 'code' });
  });

  eventBus.on('document-changed', () => {
    let nextBody = latexDoc.body;
    for (const id of selection.getSelectedIds()) {
      const lineIdx = lineIndexFromId(id);
      if (lineIdx < 0) continue;
      const comp = circuitDoc.getComponent(id);
      if (comp) {
        const replacement = emitComponentLine(comp);
        if (replacement) nextBody = updateBodyLinePreservingStructure(nextBody, lineIdx, replacement, 'component');
        continue;
      }
      const wire = circuitDoc.getWire(id);
      if (wire) nextBody = updateBodyLinePreservingStructure(nextBody, lineIdx, emitWireLine(wire), 'wire');
    }
    latexDoc.body = nextBody;
    syncTikzScale();
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  });

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
    eventBus.emit({
      type: 'cursor-grid-changed',
      gridPt: canvas.eventToGridRaw(e),
      zoomPercent: canvas.view.zoomPercent,
    });
  });

  window.addEventListener('resize', () => canvas.refresh());
  canvas.scheduleRender();

  return {
    circuitDoc,
    eventBus,
    latexDoc,
    registry,
    selection,
    toolManager,
    clearDocument: () => {
      circuitDoc.clear();
      latexDoc.body = DEFAULT_BODY;
      eventBus.emit({ type: 'body-changed' });
      eventBus.emit({ type: 'user-edited-latex' });
    },
  };
}

export function initImperativeApp(canvasContainer: HTMLElement): Promise<ImperativeAppHandle> {
  if (!initPromise) {
    initPromise = createImperativeApp(canvasContainer);
  }
  return initPromise;
}
