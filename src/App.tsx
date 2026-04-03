import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { initImperativeApp, type ImperativeAppHandle } from './initImperativeApp';
import { lineIndexFromId } from './codegen/CircuiTikZParser';
import { formatCoord } from './codegen/CoordFormatter';
import { formatLabel } from './codegen/LabelFormatter';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from 'react';
import type { ComponentDef, TerminalMark, ToolType, Rotation } from './types';
import { SNAP_GRID } from './constants';

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
] as const;

const TOOL_LABELS: Array<{ id: ToolType; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'wire', label: 'Wire' },
  { id: 'delete', label: 'Delete' },
];

function toolForDef(def: ComponentDef): ToolType {
  return def.placementType === 'bipole'
    ? 'place-bipole'
    : def.placementType === 'monopole'
      ? 'place-monopole'
      : 'place-node';
}

function Section({
  title,
  sectionId,
  collapsed,
  onToggle,
  children,
  grow = false,
}: {
  title: string;
  sectionId: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    <div className={`rpanel-section${grow ? ' rpanel-section--grow' : ''}`} id={sectionId}>
      <div className="rpanel-section-header" onClick={onToggle}>
        <span>{title}</span>
        <span className="rpanel-chevron">{collapsed ? '▶' : '▼'}</span>
      </div>
      <div className={`rpanel-section-body${collapsed ? ' rpanel-section-body--collapsed' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function ToolbarView({
  currentTool,
  onSelectTool,
  onClear,
}: {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onClear: () => void;
}) {
  return (
    <div className="toolbar">
      {TOOL_LABELS.map(({ id, label }) => (
        <button
          key={id}
          className={currentTool === id ? 'active' : ''}
          onClick={() => onSelectTool(id)}
          type="button"
        >
          {label}
        </button>
      ))}
      <div className="separator" />
      <button onClick={onClear} type="button">Clear</button>
    </div>
  );
}

function LibraryView({
  handle,
  currentDefId,
  onSelectTool,
}: {
  handle: ImperativeAppHandle | null;
  currentDefId?: string;
  onSelectTool: (tool: ToolType, defId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const defs = useMemo(() => handle?.registry.getAll() ?? [], [handle]);

  useEffect(() => {
    if (!handle) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      for (const def of defs) {
        if (def.shortcut === key) {
          e.preventDefault();
          onSelectTool(toolForDef(def), def.id);
          return;
        }
      }
      if (key === 'w') {
        e.preventDefault();
        onSelectTool('wire');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [defs, handle, onSelectTool]);

  const filtered = query
    ? defs.filter((def) =>
        def.displayName.toLowerCase().includes(query.toLowerCase()) ||
        def.tikzName.toLowerCase().includes(query.toLowerCase()) ||
        (def.group ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : defs;

  const groups = new Map<string, ComponentDef[]>();
  for (const def of filtered) {
    const key = def.group ?? 'Other';
    const list = groups.get(key);
    if (list) list.push(def);
    else groups.set(key, [def]);
  }

  const orderedGroups = [
    ...GROUP_ORDER.filter((groupName) => groups.has(groupName)),
    ...[...groups.keys()].filter((groupName) => !GROUP_ORDER.includes(groupName as typeof GROUP_ORDER[number])),
  ];

  return (
    <div id="palette">
      <input
        className="palette-search"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search component..."
        type="search"
        value={query}
      />
      <div className="palette-list">
        {orderedGroups.map((groupName) => (
          <div key={groupName}>
            <div className="category-title">{groupName}</div>
            {groups.get(groupName)?.map((def) => (
              <button
                key={def.id}
                className={`comp-btn${currentDefId === def.id ? ' active' : ''}`}
                onClick={() => onSelectTool(toolForDef(def), def.id)}
                type="button"
              >
                <span className="comp-name">{def.displayName}</span>
                {def.shortcut ? <span className="shortcut">{def.shortcut.toUpperCase()}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function terminalString(start?: TerminalMark, end?: TerminalMark): string {
  const s = start === 'dot' ? '*' : start === 'open' ? 'o' : '';
  const e = end === 'dot' ? '*' : end === 'open' ? 'o' : '';
  return `${s}-${e}`;
}

function formatGridCoord(value: number): string {
  const snapped = Math.round(value / SNAP_GRID) * SNAP_GRID;
  const decimals = Number.isInteger(SNAP_GRID) ? 0 : (String(SNAP_GRID).split('.')[1]?.length ?? 0);
  return snapped.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function PropertiesView({
  handle,
  selectedIds,
  documentVersion,
  preamble,
  setPreamble,
  stopShortcutPropagation,
}: {
  handle: ImperativeAppHandle | null;
  selectedIds: string[];
  documentVersion: number;
  preamble: string;
  setPreamble: (value: string) => void;
  stopShortcutPropagation: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  if (!handle) return <div id="props" />;

  const selectionId = selectedIds[0];
  const selectionCount = selectedIds.length;
  const comp = handle.getSelectedComponent();
  const wire = handle.getSelectedWire();

  const updateComponentProps = (props: Record<string, string | undefined>) => {
    if (!selectionId) return;
    handle.updateComponentProps(selectionId, props);
    handle.commitDocumentChange();
  };

  const updateRotation = (rotation: Rotation) => {
    if (!selectionId) return;
    handle.setComponentRotation(selectionId, rotation);
    handle.commitDocumentChange();
  };

  return (
    <div id="props" data-version={documentVersion}>
      {selectionCount === 0 ? (
        <>
          <h3>Document</h3>
          <div className="prop-group">
            <label>Preamble</label>
            <textarea
              className="code-textarea code-textarea--compact"
              onChange={(e) => setPreamble(e.target.value)}
              onKeyDown={stopShortcutPropagation}
              spellCheck={false}
              value={preamble}
            />
          </div>
        </>
      ) : null}
      {selectionCount > 1 ? <div className="empty-hint">{selectionCount} elements selected</div> : null}
      {selectionCount === 1 && wire ? <div className="empty-hint">Wire — edit in Document panel</div> : null}
      {selectionCount === 1 && comp ? (
        <>
          <h3>{handle.registry.get(comp.defId)?.displayName ?? comp.defId}</h3>
          <div className="prop-group">
            <label>Label</label>
            <input
              onChange={(e) => updateComponentProps({ label: e.target.value || undefined })}
              placeholder="$R_1$"
              type="text"
              value={comp.props.label ?? ''}
            />
          </div>
          <div className="prop-group">
            <label>Value</label>
            <input
              onChange={(e) => updateComponentProps({ value: e.target.value || undefined })}
              type="text"
              value={comp.props.value ?? ''}
            />
          </div>
          <div className="prop-group">
            <label>Voltage (v=)</label>
            <input
              onChange={(e) => updateComponentProps({ voltage: e.target.value || undefined })}
              type="text"
              value={comp.props.voltage ?? ''}
            />
          </div>
          <div className="prop-group">
            <label>Current (i=)</label>
            <input
              onChange={(e) => updateComponentProps({ current: e.target.value || undefined })}
              type="text"
              value={comp.props.current ?? ''}
            />
          </div>
          {comp.type === 'bipole' ? (
            <>
              <div className="prop-group">
                <label>Start terminal</label>
                <select
                  onChange={(e) => updateComponentProps({ startTerminal: e.target.value as TerminalMark })}
                  value={comp.props.startTerminal ?? 'none'}
                >
                  <option value="none">None (-)</option>
                  <option value="dot">Dot (*)</option>
                  <option value="open">Open (o)</option>
                </select>
              </div>
              <div className="prop-group">
                <label>End terminal</label>
                <select
                  onChange={(e) => updateComponentProps({ endTerminal: e.target.value as TerminalMark })}
                  value={comp.props.endTerminal ?? 'none'}
                >
                  <option value="none">None (-)</option>
                  <option value="dot">Dot (*)</option>
                  <option value="open">Open (o)</option>
                </select>
              </div>
            </>
          ) : null}
          {comp.type === 'monopole' ? (
            <div className="prop-group">
              <label>Rotation</label>
              <div className="rotation-btns">
                {[0, 90, 180, 270].map((rot) => (
                  <button
                    key={rot}
                    onClick={() => updateRotation(rot as Rotation)}
                    style={{ fontWeight: comp.rotation === rot ? 'bold' : undefined }}
                    type="button"
                  >
                    {rot}°
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function useAppState(handle: ImperativeAppHandle | null) {
  const [preamble, setPreamble] = useState('');
  const [body, setBody] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [currentTool, setCurrentTool] = useState<ToolType>('select');
  const [currentDefId, setCurrentDefId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [documentVersion, setDocumentVersion] = useState(0);
  const documentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!handle) return;
    const currentToolState = handle.getCurrentTool();
    setCurrentTool(currentToolState.tool);
    setCurrentDefId(currentToolState.defId);
    setSelectedIds(handle.getSelectedIds());
    setPreamble(handle.getPreamble());
    setBody(handle.getBody());

    const unsubBody = handle.onBodyChange(() => {
      setBody(handle.getBody());
      setDocumentVersion((version) => version + 1);
    });
    const unsubTool = handle.onToolChange((tool, defId) => {
      setCurrentTool(tool);
      setCurrentDefId(defId);
    });
    const unsubSelection = handle.onSelectionChange((nextSelectedIds) => {
      setSelectedIds(nextSelectedIds);
    });
    const unsubDocument = handle.onDocumentChange(() => {
      setDocumentVersion((version) => version + 1);
    });
    const unsubEdited = handle.onLatexEdited(() => {
      setSelectedIds(handle.getSelectedIds());
      setBody(handle.getBody());
      setPreamble(handle.getPreamble());
      setDocumentVersion((version) => version + 1);
    });
    return () => {
      unsubBody();
      unsubTool();
      unsubSelection();
      unsubDocument();
      unsubEdited();
    };
  }, [handle]);

  useEffect(() => {
    if (!handle) return;
    const unsub = handle.onSelectionChange((nextSelectedIds, source) => {
      if (source === 'code') return;
      if (nextSelectedIds.length !== 1) return;
      const lineIndex = lineIndexFromId(nextSelectedIds[0]);
      if (lineIndex < 0) return;
      const textarea = documentTextareaRef.current;
      if (!textarea) return;
      const lines = textarea.value.split('\n');
      if (lineIndex >= lines.length) return;
      let start = 0;
      for (let i = 0; i < lineIndex; i++) start += lines[i].length + 1;
      const end = start + lines[lineIndex].length;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 18;
      textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 2);
    });
    return unsub;
  }, [handle, body]);

  useEffect(() => {
    if (!handle) return;
    handle.setPreamble(preamble);
  }, [handle, preamble]);

  useEffect(() => {
    if (!handle) return;
    handle.setBody(body);
  }, [body, handle]);

  useEffect(() => {
    if (!handle) return;
    const timer = window.setTimeout(() => {
      handle.commitLatexEdits();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [body, preamble, handle]);

  const stopShortcutPropagation = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
  };

  const emitCaretSelection = (e: ChangeEvent<HTMLTextAreaElement> | SyntheticEvent<HTMLTextAreaElement>) => {
    if (!handle) return;
    const textarea = e.currentTarget;
    let lineIndex = 0;
    for (let i = 0; i < textarea.selectionStart; i++) {
      if (textarea.value.charCodeAt(i) === 10) lineIndex++;
    }
    handle.selectSourceLine(lineIndex);
  };

  const onCopy = async () => {
    if (!handle) return;
    await navigator.clipboard.writeText(handle.getFullLatexSource());
    setCopyLabel('Copied!');
    window.setTimeout(() => setCopyLabel('Copy'), 1500);
  };

  const onSelectTool = (tool: ToolType, defId?: string) => {
    setCurrentTool(tool);
    setCurrentDefId(defId);
    handle?.setTool(tool, defId);
  };

  const onClear = () => {
    handle?.clearDocument();
  };

  return {
    body,
    copyLabel,
    currentDefId,
    currentTool,
    documentVersion,
    documentTextareaRef,
    emitCaretSelection,
    onClear,
    onCopy,
    onSelectTool,
    preamble,
    selectedIds,
    setBody,
    setPreamble,
    stopShortcutPropagation,
  };
}

function DocumentEditor({
  body,
  copyLabel,
  documentTextareaRef,
  emitCaretSelection,
  onCopy,
  setBody,
  stopShortcutPropagation,
}: {
  body: string;
  copyLabel: string;
  documentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  emitCaretSelection: (e: ChangeEvent<HTMLTextAreaElement> | SyntheticEvent<HTMLTextAreaElement>) => void;
  onCopy: () => Promise<void>;
  setBody: (value: string) => void;
  stopShortcutPropagation: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div id="document-panel">
      <div className="code-copy-row">
        <button className="copy-btn" onClick={() => void onCopy()} type="button">{copyLabel}</button>
      </div>
      <textarea
        className="code-textarea"
        ref={documentTextareaRef}
        onChange={(e) => {
          setBody(e.target.value);
          emitCaretSelection(e);
        }}
        onClick={emitCaretSelection}
        onFocus={emitCaretSelection}
        onKeyDown={stopShortcutPropagation}
        onKeyUp={emitCaretSelection}
        onMouseUp={emitCaretSelection}
        onSelect={emitCaretSelection}
        spellCheck={false}
        value={body}
      />
    </div>
  );
}

function CanvasViewport({
  onReady,
}: {
  onReady: (handle: ImperativeAppHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    void initImperativeApp(container).then(onReady);
  }, [onReady]);

  return <div ref={containerRef} id="canvas-container" className="canvas-container" />;
}

function StatusBarView({ handle, currentTool }: { handle: ImperativeAppHandle | null; currentTool: ToolType }) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [zoomPercent, setZoomPercent] = useState(100);

  useEffect(() => {
    if (!handle) return;
    const unsub = handle.onCursorGridChange((gridPt, nextZoomPercent) => {
      setCoords({ x: gridPt.x, y: -gridPt.y });
      setZoomPercent(nextZoomPercent);
    });
    return unsub;
  }, [handle]);

  const toolLabel = currentTool === 'select'
    ? 'Select'
    : currentTool === 'wire'
      ? 'Wire'
      : currentTool === 'delete'
        ? 'Delete'
        : 'Place component';

  return (
    <div id="status-bar" className="status-bar">
      <span className="coord">{`X: ${formatGridCoord(coords.x)}  Y: ${formatGridCoord(coords.y)}`}</span>
      <span>{`Zoom: ${zoomPercent}%`}</span>
      <span>{toolLabel}</span>
    </div>
  );
}

function AppShell({ handle }: { handle: ImperativeAppHandle | null }) {
  const appState = useAppState(handle);
  const [collapsed, setCollapsed] = useState({
    library: false,
    props: false,
    document: false,
  });

  return (
    <>
      <ToolbarView currentTool={appState.currentTool} onClear={appState.onClear} onSelectTool={appState.onSelectTool} />

      <div id="left-panel" className="left-panel">
        <Section
          collapsed={collapsed.library}
          grow
          onToggle={() => setCollapsed((prev) => ({ ...prev, library: !prev.library }))}
          sectionId="section-library"
          title="Library"
        >
          <LibraryView currentDefId={appState.currentDefId} handle={handle} onSelectTool={appState.onSelectTool} />
        </Section>

        <Section
          collapsed={collapsed.props}
          onToggle={() => setCollapsed((prev) => ({ ...prev, props: !prev.props }))}
          sectionId="section-props"
          title="Properties"
        >
          <PropertiesView
            documentVersion={appState.documentVersion}
            handle={handle}
            preamble={appState.preamble}
            selectedIds={appState.selectedIds}
            setPreamble={appState.setPreamble}
            stopShortcutPropagation={appState.stopShortcutPropagation}
          />
        </Section>

        <Section
          collapsed={collapsed.document}
          grow
          onToggle={() => setCollapsed((prev) => ({ ...prev, document: !prev.document }))}
          sectionId="section-document"
          title="Document"
        >
          <DocumentEditor
            body={appState.body}
            copyLabel={appState.copyLabel}
            documentTextareaRef={appState.documentTextareaRef}
            emitCaretSelection={appState.emitCaretSelection}
            onCopy={appState.onCopy}
            setBody={appState.setBody}
            stopShortcutPropagation={appState.stopShortcutPropagation}
          />
        </Section>
      </div>

      <StatusBarView currentTool={appState.currentTool} handle={handle} />
    </>
  );
}

export function App() {
  const [handle, setHandle] = useState<ImperativeAppHandle | null>(null);

  return (
    <>
      <AppShell handle={handle} />
      <CanvasViewport onReady={setHandle} />
    </>
  );
}
