import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  SyntheticEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CssBaseline,
  Divider,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import type { ImperativeAppHandle } from './initImperativeApp';
import { initImperativeApp } from './initImperativeApp';
import { lineIndexFromId } from './codegen/CircuiTikZParser';
import type { ComponentDef, Rotation, TerminalMark, ToolType } from './types';
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

const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 640;

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

function toolForDef(def: ComponentDef): ToolType {
  return def.placementType === 'bipole'
    ? 'place-bipole'
    : def.placementType === 'monopole'
      ? 'place-monopole'
      : 'place-node';
}

function formatGridCoord(value: number): string {
  const snapped = Math.round(value / SNAP_GRID) * SNAP_GRID;
  const decimals = Number.isInteger(SNAP_GRID) ? 0 : (String(SNAP_GRID).split('.')[1]?.length ?? 0);
  return snapped.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function PanelSection({
  actions,
  children,
  expanded,
  grow = false,
  onChange,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  expanded: boolean;
  grow?: boolean;
  onChange: () => void;
  title: string;
}) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={expanded}
      onChange={onChange}
      square={false}
      sx={{
        backgroundColor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        display: 'flex',
        flexDirection: 'column',
        flex: expanded ? (grow ? '1 1 0' : '0 0 auto') : '0 0 auto',
        minHeight: expanded && grow ? 180 : 'auto',
        minWidth: 0,
        overflow: 'hidden',
        '& .MuiCollapse-root': {
          display: 'flex',
          flex: 1,
          minHeight: 0,
        },
        '& .MuiCollapse-wrapper': {
          display: 'flex',
          flex: 1,
          minHeight: 0,
        },
        '& .MuiCollapse-wrapperInner': {
          display: 'flex',
          flex: 1,
          minHeight: 0,
          width: '100%',
        },
        '& .MuiAccordion-region': {
          display: 'flex',
          flex: 1,
          minHeight: 0,
        },
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRoundedIcon fontSize="small" />}
        sx={{
          minHeight: 44,
          px: 1.5,
          '& .MuiAccordionSummary-content': {
            alignItems: 'center',
            gap: 1,
            my: 0.5,
          },
        }}
      >
        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
          variant="subtitle2"
        >
          {title}
        </Typography>
        {actions ? (
          <Box
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ ml: 'auto' }}
            >
              {actions}
            </Stack>
          </Box>
        ) : null}
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', p: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

function ToolbarView({
  currentTool,
  onClear,
  onSelectTool,
}: {
  currentTool: ToolType;
  onClear: () => void;
  onSelectTool: (tool: ToolType) => void;
}) {
  return (
    <AppBar
      color="default"
      elevation={0}
      position="static"
      sx={{ borderBottom: 1, borderColor: 'divider', gridArea: 'toolbar' }}
    >
      <Toolbar sx={{ gap: 1, minHeight: '40px !important', px: 1.5 }}>
        <ButtonGroup size="small" variant="outlined">
          {TOOL_LABELS.map(({ id, label }) => (
            <Button
              color={currentTool === id ? 'primary' : 'inherit'}
              key={id}
              onClick={() => onSelectTool(id)}
              variant={currentTool === id ? 'contained' : 'outlined'}
            >
              {label}
            </Button>
          ))}
        </ButtonGroup>
        <Divider flexItem orientation="vertical" />
        <Button onClick={onClear} size="small" variant="outlined">
          Clear
        </Button>
      </Toolbar>
    </AppBar>
  );
}

function LibraryView({
  currentDefId,
  handle,
  onSelectTool,
}: {
  currentDefId?: string;
  handle: ImperativeAppHandle | null;
  onSelectTool: (tool: ToolType, defId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const defs = useMemo(() => handle?.registry.getAll() ?? [], [handle]);

  useEffect(() => {
    if (!handle) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      for (const def of defs) {
        if (def.shortcut === key) {
          event.preventDefault();
          onSelectTool(toolForDef(def), def.id);
          return;
        }
      }
      if (key === 'w') {
        event.preventDefault();
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

  const listRef = useRef<HTMLDivElement | null>(null);

  const forwardWheelToList = (event: ReactWheelEvent<HTMLElement>) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop += event.deltaY;
    event.preventDefault();
  };

  return (
    <Box id="palette" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', p: 1 }}>
      <TextField
        fullWidth
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search component…"
        size="small"
        value={query}
      />
      <Box
        onWheel={forwardWheelToList}
        ref={listRef}
        sx={{ flex: 1, minHeight: 0, minWidth: 0, mt: 1, overflowX: 'hidden', overflowY: 'auto', pr: 0.5 }}
      >
        {orderedGroups.map((groupName) => (
          <Box key={groupName} sx={{ pb: 0.75 }}>
            <Typography
              sx={{
                color: 'text.secondary',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                mb: 0.75,
                mt: 1.25,
                px: 0.5,
                position: 'sticky',
                textTransform: 'uppercase',
                top: 0,
                zIndex: 1,
                backgroundColor: 'background.paper',
              }}
              variant="overline"
            >
              {groupName}
            </Typography>
            <Stack spacing={0.5}>
              {groups.get(groupName)?.map((def) => (
                <Button
                  color={currentDefId === def.id ? 'primary' : 'inherit'}
                  key={def.id}
                  onClick={() => onSelectTool(toolForDef(def), def.id)}
                  sx={{
                    justifyContent: 'space-between',
                    px: 1,
                    py: 0.75,
                    textTransform: 'none',
                  }}
                  variant={currentDefId === def.id ? 'contained' : 'text'}
                >
                  <Typography noWrap sx={{ flex: 1, mr: 1, textAlign: 'left' }} variant="body2">
                    {def.displayName}
                  </Typography>
                  {def.shortcut ? <Chip label={def.shortcut.toUpperCase()} size="small" variant="outlined" /> : null}
                </Button>
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function PropertiesView({
  documentVersion,
  handle,
  preamble,
  selectedIds,
  setPreamble,
  stopShortcutPropagation,
}: {
  documentVersion: number;
  handle: ImperativeAppHandle | null;
  preamble: string;
  selectedIds: string[];
  setPreamble: (value: string) => void;
  stopShortcutPropagation: (e: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  if (!handle) return <Box id="props" sx={{ flex: 1 }} />;

  const selectionId = selectedIds[0];
  const selectionCount = selectedIds.length;
  const comp = handle.getSelectedComponent();
  const wire = handle.getSelectedWire();

  const updateComponentProps = (props: Record<string, string | undefined>) => {
    if (!selectionId) return;
    handle.updateComponentProps(selectionId, props);
    handle.commitDocumentChange();
  };

  const updateRotation = (_event: ReactMouseEvent<HTMLElement>, rotation: Rotation | null) => {
    if (!selectionId || rotation == null) return;
    handle.setComponentRotation(selectionId, rotation);
    handle.commitDocumentChange();
  };

  return (
    <Stack data-version={documentVersion} id="props" spacing={1.5} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
      {selectionCount === 0 ? (
        <TextField
          fullWidth
          label="Preamble"
          multiline
          onChange={(event) => setPreamble(event.target.value)}
          onKeyDown={stopShortcutPropagation}
          spellCheck={false}
          sx={{
            '& .MuiInputBase-root': { alignItems: 'flex-start' },
            '& textarea': {
              fontFamily: '"Roboto Mono", monospace',
              fontSize: 12,
              lineHeight: 1.5,
              minHeight: 180,
              whiteSpace: 'pre',
            },
          }}
          value={preamble}
          variant="outlined"
        />
      ) : null}

      {selectionCount > 1 ? (
        <Typography color="text.secondary" sx={{ px: 0.5, py: 2, textAlign: 'center' }} variant="body2">
          {selectionCount} elements selected
        </Typography>
      ) : null}

      {selectionCount === 1 && wire ? (
        <Typography color="text.secondary" sx={{ px: 0.5, py: 2, textAlign: 'center' }} variant="body2">
          Wire. Edit geometry from the canvas or source in Document.
        </Typography>
      ) : null}

      {selectionCount === 1 && comp ? (
        <>
          <TextField
            fullWidth
            label="Label"
            onChange={(event) => updateComponentProps({ label: event.target.value || undefined })}
            placeholder="$R_1$"
            size="small"
            value={comp.props.label ?? ''}
          />
          <TextField
            fullWidth
            label="Value"
            onChange={(event) => updateComponentProps({ value: event.target.value || undefined })}
            size="small"
            value={comp.props.value ?? ''}
          />
          <TextField
            fullWidth
            label="Voltage (v=)"
            onChange={(event) => updateComponentProps({ voltage: event.target.value || undefined })}
            size="small"
            value={comp.props.voltage ?? ''}
          />
          <TextField
            fullWidth
            label="Current (i=)"
            onChange={(event) => updateComponentProps({ current: event.target.value || undefined })}
            size="small"
            value={comp.props.current ?? ''}
          />

          {comp.type === 'bipole' ? (
            <>
              <FormControl fullWidth size="small">
                <Select
                  displayEmpty
                  onChange={(event) => updateComponentProps({ startTerminal: event.target.value as TerminalMark })}
                  value={comp.props.startTerminal ?? 'none'}
                >
                  <MenuItem value="none">Start terminal: None (-)</MenuItem>
                  <MenuItem value="dot">Start terminal: Dot (*)</MenuItem>
                  <MenuItem value="open">Start terminal: Open (o)</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <Select
                  displayEmpty
                  onChange={(event) => updateComponentProps({ endTerminal: event.target.value as TerminalMark })}
                  value={comp.props.endTerminal ?? 'none'}
                >
                  <MenuItem value="none">End terminal: None (-)</MenuItem>
                  <MenuItem value="dot">End terminal: Dot (*)</MenuItem>
                  <MenuItem value="open">End terminal: Open (o)</MenuItem>
                </Select>
              </FormControl>
            </>
          ) : null}

          {comp.type === 'monopole' ? (
            <Box>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Rotation
              </Typography>
              <ButtonGroup fullWidth size="small" variant="outlined">
                {[0, 90, 180, 270].map((rot) => (
                  <Button
                    color={comp.rotation === rot ? 'primary' : 'inherit'}
                    key={rot}
                    onClick={(event) => updateRotation(event, rot as Rotation)}
                    variant={comp.rotation === rot ? 'contained' : 'outlined'}
                  >
                    {rot}°
                  </Button>
                ))}
              </ButtonGroup>
            </Box>
          ) : null}
        </>
      ) : null}
    </Stack>
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
  }, [body, handle]);

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

  const stopShortcutPropagation = (event: ReactKeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const emitCaretSelection = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> |
    SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!handle) return;
    const textarea = event.currentTarget;
    if (typeof textarea.selectionStart !== 'number') return;
    let lineIndex = 0;
    for (let i = 0; i < textarea.selectionStart; i++) {
      if (textarea.value.charCodeAt(i) === 10) lineIndex++;
    }
    handle.selectSourceLine(lineIndex);
  };

  const onCopy = async () => {
    if (!handle) return;
    await navigator.clipboard.writeText(handle.getFullLatexSource());
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy'), 1500);
  };

  const onDownloadSvg = () => {
    if (!handle) return;
    const svg = handle.getRenderedSvg();
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'circuitikz-diagram.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
    documentTextareaRef,
    documentVersion,
    emitCaretSelection,
    onClear,
    onCopy,
    onDownloadSvg,
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
  documentTextareaRef,
  emitCaretSelection,
  setBody,
  stopShortcutPropagation,
}: {
  body: string;
  documentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  emitCaretSelection: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> |
    SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  setBody: (value: string) => void;
  stopShortcutPropagation: (e: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <Box id="document-panel" sx={{ display: 'flex', flex: 1, minHeight: 0, p: 2 }}>
      <Box
        component="textarea"
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          setBody(event.target.value);
          emitCaretSelection(event);
        }}
        onClick={emitCaretSelection}
        onFocus={emitCaretSelection}
        onKeyDown={stopShortcutPropagation}
        onKeyUp={emitCaretSelection}
        onMouseUp={emitCaretSelection}
        onSelect={emitCaretSelection}
        ref={documentTextareaRef}
        spellCheck={false}
        sx={{
          backgroundColor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          color: 'text.primary',
          flex: 1,
          height: '100%',
          fontFamily: '"Roboto Mono", monospace',
          fontSize: 12,
          lineHeight: 1.5,
          minHeight: 0,
          outline: 'none',
          p: 1.25,
          resize: 'none',
          whiteSpace: 'pre',
          '&:focus': {
            borderColor: 'primary.main',
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}`,
          },
        }}
        value={body}
      />
    </Box>
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

  return <div className="canvas-container" id="canvas-container" ref={containerRef} />;
}

function StatusBarView({
  currentTool,
  handle,
}: {
  currentTool: ToolType;
  handle: ImperativeAppHandle | null;
}) {
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
    <Paper
      elevation={0}
      square
      sx={{
        alignItems: 'center',
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        gap: 2,
        gridArea: 'status',
        px: 1.5,
      }}
    >
      <Typography sx={{ fontFamily: '"Roboto Mono", monospace' }} variant="caption">
        {`X: ${formatGridCoord(coords.x)}  Y: ${formatGridCoord(coords.y)}`}
      </Typography>
      <Typography variant="caption">{`Zoom: ${zoomPercent}%`}</Typography>
      <Typography variant="caption">{toolLabel}</Typography>
    </Paper>
  );
}

function AppShell({ handle }: { handle: ImperativeAppHandle | null }) {
  const appState = useAppState(handle);
  const [collapsed, setCollapsed] = useState({
    document: false,
    library: false,
    props: false,
  });
  const selectedCount = appState.selectedIds.length;
  const selectedComponent = handle?.getSelectedComponent();
  const selectedWire = handle?.getSelectedWire();
  const propertiesTitle = selectedCount === 0
    ? 'Properties: Document'
    : selectedCount > 1
      ? `Properties: ${selectedCount} Selected`
      : selectedWire
        ? 'Properties: Wire'
        : `Properties: ${handle?.registry.get(selectedComponent?.defId ?? '')?.displayName ?? selectedComponent?.defId ?? 'Component'}`;

  return (
    <>
      <ToolbarView currentTool={appState.currentTool} onClear={appState.onClear} onSelectTool={appState.onSelectTool} />

      <Box
        className="left-panel"
        id="left-panel"
        sx={{
          backgroundColor: 'background.default',
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          gridArea: 'lpanel',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          p: 1,
        }}
      >
        <PanelSection
          expanded={!collapsed.library}
          grow
          onChange={() => setCollapsed((prev) => ({ ...prev, library: !prev.library }))}
          title="Library"
        >
          <LibraryView currentDefId={appState.currentDefId} handle={handle} onSelectTool={appState.onSelectTool} />
        </PanelSection>

        <PanelSection
          expanded={!collapsed.props}
          onChange={() => setCollapsed((prev) => ({ ...prev, props: !prev.props }))}
          title={propertiesTitle}
        >
          <PropertiesView
            documentVersion={appState.documentVersion}
            handle={handle}
            preamble={appState.preamble}
            selectedIds={appState.selectedIds}
            setPreamble={appState.setPreamble}
            stopShortcutPropagation={appState.stopShortcutPropagation}
          />
        </PanelSection>

        <PanelSection
          actions={
            <>
              <Button onClick={() => void appState.onCopy()} size="small" startIcon={<ContentCopyRoundedIcon fontSize="small" />} variant="outlined">
                {appState.copyLabel}
              </Button>
              <Button onClick={appState.onDownloadSvg} size="small" startIcon={<DownloadRoundedIcon fontSize="small" />} variant="outlined">
                SVG
              </Button>
            </>
          }
          expanded={!collapsed.document}
          grow
          onChange={() => setCollapsed((prev) => ({ ...prev, document: !prev.document }))}
          title="Document"
        >
          <DocumentEditor
            body={appState.body}
            documentTextareaRef={appState.documentTextareaRef}
            emitCaretSelection={appState.emitCaretSelection}
            setBody={appState.setBody}
            stopShortcutPropagation={appState.stopShortcutPropagation}
          />
        </PanelSection>
      </Box>

      <StatusBarView currentTool={appState.currentTool} handle={handle} />
    </>
  );
}

export function App() {
  const [handle, setHandle] = useState<ImperativeAppHandle | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = window.localStorage.getItem('sidebar-width');
    const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_SIDEBAR_WIDTH;
    return Number.isFinite(parsed)
      ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed))
      : DEFAULT_SIDEBAR_WIDTH;
  });
  const resizeStateRef = useRef<{ startWidth: number; startX: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    window.localStorage.setItem('sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)));
    };

    const onMouseUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('is-resizing-sidebar');
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startSidebarResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStateRef.current = { startWidth: sidebarWidth, startX: event.clientX };
    document.body.classList.add('is-resizing-sidebar');
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <>
        <AppShell handle={handle} />
        <div
          aria-label="Resize sidebar"
          className="sidebar-resizer"
          onMouseDown={startSidebarResize}
          role="separator"
        />
        <CanvasViewport onReady={setHandle} />
      </>
    </ThemeProvider>
  );
}
