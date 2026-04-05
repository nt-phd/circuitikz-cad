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
import { emitPlacedNodeLine } from './codegen/NodeEmitter';
import { DEFAULT_BODY } from './model/LatexDocument';
import type { ComponentInstance, DrawingInstance, WireInstance, TerminalMark, ToolType, Rotation, ComponentProps, WireRoutingMode } from './types';
import type { ToolContext } from './tools/BaseTool';
import type { ClipboardPayload, ClipboardEntry } from './tools/SelectionClipboard';
import { materializeClipboardAt } from './tools/SelectionClipboard';

let initialized = false;
let initPromise: Promise<ImperativeAppHandle> | null = null;

function appendLineToBody(body: string, line: string): string {
  const marker = '\\end{tikzpicture}';
  const idx = body.lastIndexOf(marker);
  if (idx === -1) return body + '\n' + line;
  return body.slice(0, idx) + '  ' + line + '\n' + body.slice(idx);
}

function appendLinesToBody(body: string, linesToAppend: string[]): { body: string; startLineIndex: number } {
  const marker = '\\end{tikzpicture}';
  const lines = body.split('\n');
  const markerIndex = lines.findIndex((line) => line.includes(marker));
  const insertIndex = markerIndex >= 0 ? markerIndex : lines.length;
  const indented = linesToAppend.map((line) => `  ${line}`);
  lines.splice(insertIndex, 0, ...indented);
  return { body: lines.join('\n'), startLineIndex: insertIndex };
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
    return emitPlacedNodeLine(comp, tikzName);
  }
  if (comp.type === 'node') {
    return emitPlacedNodeLine(comp, tikzName);
  }
  return null;
}

function emitComponentSegment(comp: ComponentInstance): string | null {
  const def = registry.get(comp.defId);
  const tikzName = def?.tikzName ?? comp.defId;
  if (comp.type === 'bipole') {
    const opts: string[] = [tikzName];
    const term = terminalString(comp.props.startTerminal, comp.props.endTerminal);
    if (term !== '-') opts.push(term);
    if (comp.props.label) opts.push(`l=${formatLabel(comp.props.label)}`);
    if (comp.props.voltage) opts.push(`v=${formatLabel(comp.props.voltage)}`);
    if (comp.props.current) opts.push(`i=${formatLabel(comp.props.current)}`);
    return `${formatCoord(comp.start)} to[${opts.join(', ')}] ${formatCoord(comp.end)}`;
  }
  if (comp.type === 'monopole' || comp.type === 'node') {
    const optionParts = [tikzName];
    const extraOptions = (comp.props.options ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.startsWith('rotate='));
    if (comp.rotation) extraOptions.push(`rotate=${comp.rotation}`);
    if (extraOptions.length > 0) optionParts.push(extraOptions.join(', '));
    return `${formatCoord(comp.position)} node[${optionParts.join(', ')}] {}`;
  }
  return null;
}

function emitWireLine(wire: WireInstance): string {
  if (wire.points.length < 2) return '\\draw ;';
  return `\\draw ${emitWirePath(wire)};`;
}

function emitWireSegment(wire: WireInstance): string {
  if (wire.points.length < 2) return '';
  return emitWirePath(wire);
}

function emitDrawingLine(drawing: DrawingInstance): string {
  switch (drawing.kind) {
    case 'line':
      return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} -- ${formatCoord(drawing.end)};`;
    case 'arrow':
      return `\\draw[${drawing.props.options || '->'}] ${formatCoord(drawing.start)} -- ${formatCoord(drawing.end)};`;
    case 'text':
      {
        const optionParts: string[] = [];
        if (drawing.props.anchor) optionParts.push(`anchor=${drawing.props.anchor}`);
        if (drawing.props.rotation) optionParts.push(`rotate=${drawing.props.rotation}`);
        if (drawing.props.scale) optionParts.push(`scale=${drawing.props.scale}`);
        if (drawing.props.options) optionParts.push(drawing.props.options);
        const options = optionParts.length > 0 ? `[${optionParts.join(', ')}]` : '';
        return `\\node${options} at ${formatCoord(drawing.position)} {${drawing.props.text ?? 'Text'}};`;
      }
    case 'rectangle':
      return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} rectangle ${formatCoord(drawing.end)};`;
    case 'circle':
      return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.center)} circle (${drawing.radius});`;
    case 'bezier':
      return `\\draw[${drawing.props.options || 'thin'}] ${formatCoord(drawing.start)} .. controls ${formatCoord(drawing.control1)} and ${formatCoord(drawing.control2)} .. ${formatCoord(drawing.end)};`;
  }
}

function emitClipboardEntry(entry: ClipboardEntry): string | null {
  if (entry.kind === 'component') return emitComponentLine(entry.item);
  if (entry.kind === 'wire') return emitWireLine(entry.item);
  return emitDrawingLine(entry.item);
}

function updateBodyLinePreservingStructure(body: string, lineIndex: number, replacement: string, kind: 'component' | 'wire'): string {
  const lines = body.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  const original = lines[lineIndex];
  const indent = original.match(/^\s*/)?.[0] ?? '';
  const trimmed = original.trim();
  const compactSegment = trimmed.startsWith('(');
  const normalized = compactSegment
    ? replacement.replace(/^\\draw\s+/, '').replace(/;$/, '')
    : replacement;
  lines[lineIndex] = `${indent}${normalized}`;

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

function lineIdParts(id: string): { lineIndex: number; subIndex: number | null } {
  const m = id.match(/^line:(\d+)(?::(\d+))?$/);
  return {
    lineIndex: m ? Number.parseInt(m[1], 10) : -1,
    subIndex: m?.[2] ? Number.parseInt(m[2], 10) : null,
  };
}

function replaceBodyLinesWithGroups(
  body: string,
  replacements: Map<number, Array<{ id: string; line: string }>>,
): { body: string; idMap: Map<string, string> } {
  const lines = body.split('\n');
  const nextLines: string[] = [];
  const idMap = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const group = replacements.get(i);
    if (!group) {
      nextLines.push(lines[i]);
      continue;
    }
    const indent = lines[i].match(/^\s*/)?.[0] ?? '';
    for (const entry of group) {
      const nextLineIndex = nextLines.length;
      nextLines.push(`${indent}${entry.line}`);
      idMap.set(entry.id, `line:${nextLineIndex}`);
    }
  }

  return { body: nextLines.join('\n'), idMap };
}

function collectGroupedLineReplacements(doc: CircuitDocument): Map<number, Array<{ id: string; line: string }>> {
  const allEntries = [
    ...doc.components.map((comp) => ({ id: comp.id, line: emitComponentLine(comp) })),
    ...doc.wires.map((wire) => ({ id: wire.id, line: emitWireLine(wire) })),
    ...doc.drawings.map((drawing) => ({ id: drawing.id, line: emitDrawingLine(drawing) })),
  ].filter((entry): entry is { id: string; line: string } => Boolean(entry.line));

  const replacements = new Map<number, Array<{ id: string; line: string }>>();
  for (const entry of allEntries) {
    const parts = lineIdParts(entry.id);
    if (parts.subIndex === null || parts.lineIndex < 0) continue;
    const bucket = replacements.get(parts.lineIndex) ?? [];
    bucket.push(entry);
    replacements.set(parts.lineIndex, bucket);
  }
  for (const [lineIndex, bucket] of replacements) {
    bucket.sort((a, b) => (lineIdParts(a.id).subIndex ?? 0) - (lineIdParts(b.id).subIndex ?? 0));
    replacements.set(lineIndex, bucket);
  }
  return replacements;
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
  loadFullLatexSource: (source: string) => void;
  getRenderedSvg: () => string | null;
  getLibraryPreviewProbe: (defId: string, onResolved: () => void) => ComponentRenderProbe | null;
  warmLibraryPreviewProbes: (onResolved: () => void) => void;
  getInUseDefIds: () => string[];
  getSelectedComponent: () => ComponentInstance | undefined;
  getSelectedDrawing: () => DrawingInstance | undefined;
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
  updateDrawingProps: (id: string, props: Record<string, string | undefined>) => void;
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

  const existingSelectableIds = (): Set<string> => new Set([
    ...circuitDoc.components.map((comp) => comp.id),
    ...circuitDoc.wires.map((wire) => wire.id),
    ...circuitDoc.drawings.map((drawing) => drawing.id),
  ]);

  const reconcileSelection = (source: 'programmatic' | 'canvas' | 'code') => {
    const previous = selection.getSelectedIds();
    const existing = existingSelectableIds();
    const next = previous.filter((id) => existing.has(id));
    selection.setSelectedIds(next);
    eventBus.emit({ type: 'selection-changed', selectedIds: next, source });
  };

  const applyFullSource = (source: string) => {
    latexDoc.loadFromSource(source);
    syncTikzScale();
    componentProbeService.invalidate();
    parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    reconcileSelection('programmatic');
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
        circuitDoc.removeDrawing(id);
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
    placeClipboard: (payload, target) => {
      pushUndoSnapshot();
      const entries = materializeClipboardAt(payload, target, () => circuitDoc.nextNodeName());
      const lines = entries
        .map((entry) => emitClipboardEntry(entry))
        .filter((line): line is string => Boolean(line));
      if (lines.length === 0) return;
      const appended = appendLinesToBody(latexDoc.body, lines);
      latexDoc.body = appended.body;
      syncTikzScale();
      componentProbeService.invalidate();
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
      const selectedIds = lines.map((_, index) => `line:${appended.startLineIndex + index}`);
      selection.setSelectedIds(selectedIds);
      eventBus.emit({ type: 'selection-changed', selectedIds, source: 'canvas' });
      eventBus.emit({ type: 'body-changed' });
      eventBus.emit({ type: 'user-edited-latex' });
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
    const selectedIds = (circuitDoc.getComponent(id) || circuitDoc.getWire(id) || circuitDoc.getDrawing(id)) ? [id] : [];
    eventBus.emit({ type: 'selection-changed', selectedIds, source: 'code' });
  });

  eventBus.on('document-changed', () => {
    pushUndoSnapshot();
    let nextBody = latexDoc.body;
    const sourceLines = nextBody.split('\n');
    const groupedLineIndices = new Set(
      selection.getSelectedIds()
        .map((id) => lineIdParts(id))
        .filter((parts) => parts.subIndex !== null)
        .map((parts) => parts.lineIndex),
    );

    if (groupedLineIndices.size > 0) {
      const replacements = collectGroupedLineReplacements(circuitDoc);
      for (const lineIndex of [...replacements.keys()]) {
        if (!groupedLineIndices.has(lineIndex)) replacements.delete(lineIndex);
      }

      const replaced = replaceBodyLinesWithGroups(nextBody, replacements);
      latexDoc.body = replaced.body;
      syncTikzScale();
      componentProbeService.invalidate();
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
      const nextSelectedIds = selection.getSelectedIds().map((id) => replaced.idMap.get(id) ?? id);
      selection.setSelectedIds(nextSelectedIds);
      reconcileSelection('programmatic');
      eventBus.emit({ type: 'body-changed' });
      canvas.refresh();
      canvas.scheduleRender();
      return;
    }

    for (const id of selection.getSelectedIds()) {
      const lineIdx = lineIndexFromId(id);
      if (lineIdx < 0) continue;
      const originalLine = sourceLines[lineIdx]?.trim() ?? '';
      const compactSegment = originalLine.startsWith('(');
      const comp = circuitDoc.getComponent(id);
      if (comp) {
        const replacement = compactSegment ? emitComponentSegment(comp) : emitComponentLine(comp);
        if (replacement) nextBody = updateBodyLinePreservingStructure(nextBody, lineIdx, replacement, 'component');
        continue;
      }
      const wire = circuitDoc.getWire(id);
      if (wire) {
        nextBody = updateBodyLinePreservingStructure(nextBody, lineIdx, compactSegment ? emitWireSegment(wire) : emitWireLine(wire), 'wire');
        continue;
      }
      const drawing = circuitDoc.getDrawing(id);
      if (drawing) nextBody = updateBodyLinePreservingStructure(nextBody, lineIdx, emitDrawingLine(drawing), 'wire');
    }
    latexDoc.body = nextBody;
    syncTikzScale();
    componentProbeService.invalidate();
    eventBus.emit({ type: 'body-changed' });
    canvas.refresh();
    canvas.scheduleRender();
  });

  eventBus.on('user-edited-latex', () => {
    const previousSelection = selection.getSelectedIds();
    syncTikzScale();
    componentProbeService.invalidate();
    parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    const groupedReplacements = collectGroupedLineReplacements(circuitDoc);
    if (groupedReplacements.size > 0) {
      const replaced = replaceBodyLinesWithGroups(latexDoc.body, groupedReplacements);
      latexDoc.body = replaced.body;
      parseCircuiTikZ(latexDoc.body, circuitDoc, registry);
    }
    selection.setSelectedIds(previousSelection);
    reconcileSelection('programmatic');
    eventBus.emit({ type: 'body-changed' });
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
    loadFullLatexSource: (source) => {
      pushUndoSnapshot();
      applyFullSource(source);
      eventBus.emit({ type: 'user-edited-latex' });
    },
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
        }, onResolved, true);
      }
      return componentProbeService.getPlacedGhostProbe(def, 0, onResolved, true);
    },
    warmLibraryPreviewProbes: (onResolved) => {
      for (const def of registry.getAll()) {
        componentProbeService.primeLibraryProbe(def, onResolved);
      }
    },
    getInUseDefIds: () => [...new Set(circuitDoc.components.map((comp) => comp.defId))],
    getSelectedComponent: () => {
      const [id] = selection.getSelectedIds();
      return id ? circuitDoc.getComponent(id) : undefined;
    },
    getSelectedDrawing: () => {
      const [id] = selection.getSelectedIds();
      return id ? circuitDoc.getDrawing(id) : undefined;
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
    updateDrawingProps: (id, props) => {
      const drawing = circuitDoc.getDrawing(id);
      if (!drawing) return;
      drawing.props = { ...drawing.props, ...props };
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
