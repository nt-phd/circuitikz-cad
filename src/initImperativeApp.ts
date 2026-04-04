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
import { extractCtikzScales, extractTikzScale, scaleState } from './canvas/ScaleState';
import { componentProbeService } from './canvas/ComponentProbeService';
import type { ComponentRenderProbe } from './canvas/ComponentProbeService';
import { formatCoord } from './codegen/CoordFormatter';
import { formatLabel } from './codegen/LabelFormatter';
import { emitWirePath } from './codegen/WirePathEmitter';
import { DEFAULT_BODY } from './model/LatexDocument';
import type { ComponentInstance, WireInstance, TerminalMark, ToolType, Rotation, ComponentProps, WireRoutingMode } from './types';
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
    const nodeName = comp.nodeName ? `(${comp.nodeName})` : '';
    return `\\node[${tikzName}]${nodeName} at ${formatCoord(comp.position)} {};`;
  }
  if (comp.type === 'node') {
    const nodeName = comp.nodeName ? `(${comp.nodeName})` : '';
    return `\\node[${tikzName}]${nodeName} at ${formatCoord(comp.position)} {};`;
  }
  return null;
}

function emitWireLine(wire: WireInstance): string {
  if (wire.points.length < 2) return '\\draw ;';
  return `\\draw ${emitWirePath(wire)};`;
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

function removeBodyLines(body: string, lineIndices: number[]): string {
  const lines = body.split('\n');
  const sorted = [...new Set(lineIndices)].sort((a, b) => b - a);
  for (const lineIndex of sorted) {
    if (lineIndex >= 0 && lineIndex < lines.length) lines.splice(lineIndex, 1);
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
  getCurrentTool: () => { tool: ToolType; defId?: string };
  getSelectedIds: () => string[];
  getPreamble: () => string;
  getBody: () => string;
  getFullLatexSource: () => string;
  getRenderedSvg: () => string | null;
  getLibraryPreviewProbe: (defId: string, onResolved: () => void) => ComponentRenderProbe | null;
  getSelectedComponent: () => ComponentInstance | undefined;
  getSelectedWire: () => WireInstance | undefined;
  getGridVisible: () => boolean;
  getGridPitch: () => number;
  getPinSnapEnabled: () => boolean;
  getWireRoutingMode: () => WireRoutingMode;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  setTool: (tool: ToolType, defId?: string) => void;
  setGridVisible: (visible: boolean) => void;
  setGridPitch: (pitch: number) => void;
  setPinSnapEnabled: (enabled: boolean) => void;
  setWireRoutingMode: (mode: WireRoutingMode) => void;
  setSelectedIds: (selectedIds: string[], source?: 'canvas' | 'code' | 'programmatic') => void;
  selectSourceLine: (lineIndex: number) => void;
  setPreamble: (preamble: string) => void;
  setBody: (body: string) => void;
  updateComponentProps: (id: string, props: Partial<ComponentProps>) => void;
  setComponentRotation: (id: string, rotation: Rotation) => void;
  undo: () => void;
  commitLatexEdits: () => void;
  commitDocumentChange: () => void;
  onToolChange: (fn: (tool: ToolType, defId?: string) => void) => () => void;
  onSelectionChange: (fn: (selectedIds: string[], source?: 'canvas' | 'code' | 'programmatic') => void) => () => void;
  onBodyChange: (fn: () => void) => () => void;
  onDocumentChange: (fn: () => void) => () => void;
  onLatexEdited: (fn: () => void) => () => void;
  onCursorGridChange: (fn: (gridPt: { x: number; y: number }, zoomPercent: number) => void) => () => void;
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
  const undoStack: string[] = [];
  let gridVisible = true;

  const canvas = new LatexCanvas(canvasContainer, latexDoc, circuitDoc, registry, selection);
  componentProbeService.configure(() => ({ body: latexDoc.body, preamble: latexDoc.preamble }));

  const syncTikzScale = () => {
    scaleState.tikzScale = extractTikzScale(latexDoc.body);
    scaleState.componentScales = extractCtikzScales(`${latexDoc.preamble}\n${latexDoc.body}`);
    canvas.updateGridScale();
  };

  const applyFullSource = (source: string) => {
    latexDoc.loadFromSource(source);
    syncTikzScale();
    componentProbeService.invalidate();
    parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    selection.clear();
    eventBus.emit({ type: 'selection-changed', selectedIds: [], source: 'programmatic' });
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  };

  const pushUndoSnapshot = () => {
    const current = latexDoc.toFullSource();
    if (undoStack[undoStack.length - 1] !== current) undoStack.push(current);
  };

  syncTikzScale();
  scaleState.gridPitch = circuitDoc.metadata.snapSize;

  const toolCtx: ToolContext = {
    ghost: canvas.ghost,
    hitTester: canvas.hitTester,
    emit: (e) => eventBus.emit(e),
    getDocument: () => circuitDoc,
    getDef: (defId: string) => registry.get(defId),
    appendLine: (line: string) => {
      pushUndoSnapshot();
      latexDoc.body = appendLineToBody(latexDoc.body, line);
      syncTikzScale();
      componentProbeService.invalidate();
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
      eventBus.emit({ type: 'body-changed' });
      canvas.refresh();
      canvas.scheduleRender();
    },
    deleteElements: (ids: string[]) => {
      if (ids.length === 0) return;
      pushUndoSnapshot();
      const lineIndices = ids.map(lineIndexFromId).filter((idx) => idx >= 0);
      for (const id of ids) {
        circuitDoc.removeComponent(id);
        circuitDoc.removeWire(id);
      }
      latexDoc.body = removeBodyLines(latexDoc.body, lineIndices);
      syncTikzScale();
      componentProbeService.invalidate();
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
      selection.clear();
      eventBus.emit({ type: 'selection-changed', selectedIds: [], source: 'canvas' });
      eventBus.emit({ type: 'body-changed' });
      canvas.refresh();
      canvas.scheduleRender();
    },
    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      applyFullSource(previous);
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
    pushUndoSnapshot();
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
    componentProbeService.invalidate();
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  });

  eventBus.on('user-edited-latex', () => {
    syncTikzScale();
    componentProbeService.invalidate();
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
    getCurrentTool: () => ({ tool: toolManager.currentType, defId: toolManager.currentDefId }),
    getSelectedIds: () => selection.getSelectedIds(),
    getPreamble: () => latexDoc.preamble,
    getBody: () => latexDoc.body,
    getFullLatexSource: () => latexDoc.toFullSource(),
    getRenderedSvg: () => canvas.getRenderedSvg(),
    getLibraryPreviewProbe: (defId, onResolved) => {
      const def = registry.get(defId);
      if (!def) return null;
      if (def.placementType === 'bipole') {
        return componentProbeService.getBipoleGhostProbe(def, {
          id: '__library_probe__',
          defId,
          type: 'bipole',
          start: { x: 0, y: 0 },
          end: { x: 2, y: 0 },
          props: {},
        }, onResolved);
      }
      return componentProbeService.getPlacedGhostProbe(def, 0, onResolved);
    },
    getSelectedComponent: () => {
      const [id] = selection.getSelectedIds();
      return id ? circuitDoc.getComponent(id) : undefined;
    },
    getSelectedWire: () => {
      const [id] = selection.getSelectedIds();
      return id ? circuitDoc.getWire(id) : undefined;
    },
    getGridVisible: () => gridVisible,
    getGridPitch: () => circuitDoc.metadata.snapSize,
    getPinSnapEnabled: () => canvas.hitTester.connectionSnapEnabled,
    getWireRoutingMode: () => toolManager.wireRoutingMode,
    zoomIn: () => canvas.zoomIn(),
    zoomOut: () => canvas.zoomOut(),
    fitToScreen: () => canvas.fitToScreen(),
    setTool: (tool, defId) => toolManager.setTool(tool, defId),
    setGridVisible: (visible) => {
      gridVisible = visible;
      canvas.setGridVisible(visible);
    },
    setGridPitch: (pitch) => {
      circuitDoc.metadata.snapSize = pitch;
      scaleState.gridPitch = pitch;
      canvas.updateGridScale();
      canvas.refresh();
    },
    setPinSnapEnabled: (enabled) => {
      canvas.hitTester.connectionSnapEnabled = enabled;
    },
    setWireRoutingMode: (mode) => {
      toolManager.setWireRoutingMode(mode);
    },
    setSelectedIds: (selectedIds, source = 'programmatic') => {
      eventBus.emit({ type: 'selection-changed', selectedIds, source });
    },
    selectSourceLine: (lineIndex) => {
      eventBus.emit({ type: 'code-caret-changed', lineIndex });
    },
    setPreamble: (preamble) => {
      latexDoc.preamble = preamble;
      componentProbeService.invalidate();
    },
    setBody: (body) => {
      latexDoc.body = body;
      componentProbeService.invalidate();
    },
    updateComponentProps: (id, props) => {
      const comp = circuitDoc.getComponent(id);
      if (!comp) return;
      Object.assign(comp.props, props);
    },
    setComponentRotation: (id, rotation) => {
      const comp = circuitDoc.getComponent(id);
      if (!comp) return;
      if (comp.type === 'monopole' || comp.type === 'node') {
        comp.rotation = rotation;
      }
    },
    undo: () => {
      toolCtx.undo();
    },
    commitLatexEdits: () => {
      pushUndoSnapshot();
      eventBus.emit({ type: 'user-edited-latex' });
    },
    commitDocumentChange: () => {
      pushUndoSnapshot();
      eventBus.emit({ type: 'document-changed' });
    },
    onToolChange: (fn) => eventBus.on('tool-changed', (event) => {
      if (event.type !== 'tool-changed') return;
      fn(event.tool, event.defId);
    }),
    onSelectionChange: (fn) => eventBus.on('selection-changed', (event) => {
      if (event.type !== 'selection-changed') return;
      fn(event.selectedIds, event.source);
    }),
    onBodyChange: (fn) => eventBus.on('body-changed', fn),
    onDocumentChange: (fn) => eventBus.on('document-changed', fn),
    onLatexEdited: (fn) => eventBus.on('user-edited-latex', fn),
    onCursorGridChange: (fn) => eventBus.on('cursor-grid-changed', (event) => {
      if (event.type !== 'cursor-grid-changed') return;
      fn(event.gridPt, event.zoomPercent);
    }),
    clearDocument: () => {
      pushUndoSnapshot();
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
