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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import RouteSharpIcon from '@mui/icons-material/RouteSharp';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import Grid4x4RoundedIcon from '@mui/icons-material/Grid4x4Rounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import OpenWithRoundedIcon from '@mui/icons-material/OpenWithRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import NavigationRoundedIcon from '@mui/icons-material/NavigationRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import ArrowRightAltRoundedIcon from '@mui/icons-material/ArrowRightAltRounded';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import CropSquareRoundedIcon from '@mui/icons-material/CropSquareRounded';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import type { ImperativeAppHandle } from './initImperativeApp';
import { initImperativeApp } from './initImperativeApp';
import { lineIndexFromId } from './codegen/CircuiTikZParser';
import type { ComponentDef, DrawingInstance, Rotation, TerminalMark, ToolType } from './types';
import type { WireRoutingMode } from './types';
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

const TOOL_LABELS: Array<{ activeWhen: ToolType; icon: ReactNode; id: ToolType; label: string }> = [
  { id: 'move', activeWhen: 'move', label: 'Move', icon: <OpenWithRoundedIcon fontSize="small" /> },
  { id: 'select', activeWhen: 'select', label: 'Select', icon: <NavigationRoundedIcon fontSize="small" /> },
  { id: 'wire', activeWhen: 'wire', label: 'Wire', icon: <RouteSharpIcon fontSize="small" /> },
  { id: 'delete', activeWhen: 'delete', label: 'Delete', icon: <DeleteOutlineRoundedIcon fontSize="small" /> },
];

const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 640;

function toolForDef(def: ComponentDef): ToolType {
  return def.placementType === 'bipole'
    ? 'place-bipole'
    : def.placementType === 'monopole'
      ? 'place-monopole'
      : 'place-node';
}

function isEditTool(tool: ToolType): boolean {
  return tool === 'select'
    || tool === 'draw-line'
    || tool === 'draw-arrow'
    || tool === 'draw-text'
    || tool === 'draw-rectangle'
    || tool === 'draw-circle'
    || tool === 'draw-bezier';
}

function formatGridCoord(value: number, pitch: number): string {
  const snapped = Math.round(value / pitch) * pitch;
  const decimals = Number.isInteger(pitch) ? 0 : (String(pitch).split('.')[1]?.length ?? 0);
  return snapped.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function namespaceInlineSvg(markup: string, prefix: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(markup, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return markup;
    const idMap = new Map<string, string>();
    for (const element of svg.querySelectorAll('[id]')) {
      const current = element.getAttribute('id');
      if (!current) continue;
      const next = `${prefix}-${current}`;
      idMap.set(current, next);
      element.setAttribute('id', next);
    }
    const attrs = ['href', 'xlink:href', 'clip-path', 'fill', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'mask', 'stroke'];
    for (const element of svg.querySelectorAll('*')) {
      for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        let next = value;
        for (const [from, to] of idMap) {
          next = next.replaceAll(`url(#${from})`, `url(#${to})`).replaceAll(`#${from}`, `#${to}`);
        }
        if (next !== value) element.setAttribute(attr, next);
      }
      const style = element.getAttribute('style');
      if (!style) continue;
      let nextStyle = style;
      for (const [from, to] of idMap) {
        nextStyle = nextStyle.replaceAll(`url(#${from})`, `url(#${to})`).replaceAll(`#${from}`, `#${to}`);
      }
      if (nextStyle !== style) element.setAttribute('style', nextStyle);
    }
    return svg.outerHTML;
  } catch {
    return markup;
  }
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
    <Box
      sx={{
        backgroundColor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        display: 'flex',
        flexDirection: 'column',
        flex: expanded ? (grow ? '1 1 0' : '0 0 auto') : '0 0 auto',
        minHeight: expanded && grow ? 120 : 'auto',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Button
        fullWidth
        onClick={onChange}
        sx={{
          borderBottom: expanded ? 1 : 0,
          borderColor: 'divider',
          borderRadius: 0,
          color: 'text.primary',
          justifyContent: 'space-between',
          minHeight: 44,
          px: 1.5,
          py: 0.5,
          textTransform: 'none',
        }}
        variant="text"
      >
        <Stack alignItems="center" direction="row" spacing={1} sx={{ minWidth: 0 }}>
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
              <Stack direction="row" spacing={0.75}>
                {actions}
              </Stack>
            </Box>
          ) : null}
        </Stack>
        <ExpandMoreRoundedIcon
          fontSize="small"
          sx={{
            color: 'text.secondary',
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </Button>
      {expanded ? (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

function ToolbarView({
  currentTool,
  gridVisible,
  onToggleGridVisible,
  onTogglePinSnap,
  onToggleThemeMode,
  onWireRoutingModeChange,
  pinSnapEnabled,
  onClear,
  onFitToScreen,
  onSelectTool,
  onUndo,
  onZoomIn,
  onZoomOut,
  themeMode,
  wireRoutingMode,
}: {
  currentTool: ToolType;
  gridVisible: boolean;
  onToggleGridVisible: (checked: boolean) => void;
  onTogglePinSnap: (checked: boolean) => void;
  onToggleThemeMode: () => void;
  onWireRoutingModeChange: (mode: WireRoutingMode) => void;
  pinSnapEnabled: boolean;
  onClear: () => void;
  onFitToScreen: () => void;
  onSelectTool: (tool: ToolType) => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  themeMode: 'light' | 'dark';
  wireRoutingMode: WireRoutingMode;
}) {
  const toolbarToggleSx = {
    alignSelf: 'center',
    height: 30,
    minHeight: 30,
    minWidth: 34,
    px: 0.75,
    py: 0.35,
    textTransform: 'none',
  } as const;
  const toolbarButtonSx = {
    alignSelf: 'center',
    height: 30,
    minHeight: 30,
    minWidth: 34,
    px: 0.75,
    py: 0.35,
  } as const;

  return (
    <AppBar
      color="default"
      elevation={0}
      position="static"
      sx={{ borderBottom: 1, borderColor: 'divider', gridArea: 'toolbar' }}
    >
      <Toolbar sx={{ gap: 1, minHeight: '40px !important', px: 1.5 }}>
        <Stack alignItems="center" direction="row" spacing={1} sx={{ mr: 1.5 }}>
          <Box
            alt="CircuitikZ CAD"
            component="img"
            src="/favicon.svg"
            sx={{ display: 'block', height: 18, width: 18 }}
          />
          <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }} variant="body2">
            CircuitikZ CAD
          </Typography>
        </Stack>
        <Divider flexItem orientation="vertical" />
        <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }} variant="caption">
          Mode
        </Typography>
        <ToggleButtonGroup
          exclusive
          onChange={(_event, value: ToolType | null) => {
            if (value) onSelectTool(value);
          }}
          size="small"
          sx={{ alignSelf: 'center', '& .MuiToggleButton-root': toolbarToggleSx }}
          value={isEditTool(currentTool) ? 'select' : currentTool}
        >
          {TOOL_LABELS.map(({ activeWhen, icon, id, label }) => (
            <Tooltip
              key={`${id}-${label}`}
              title={
                label === 'Move'
                  ? 'Move canvas'
                  : label === 'Select'
                    ? 'Select and edit'
                    : label === 'Wire'
                      ? 'Draw wire'
                      : 'Delete by click'
              }
            >
              <ToggleButton aria-label={label} value={activeWhen}>
                {icon}
              </ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
        <Divider flexItem orientation="vertical" />
        {isEditTool(currentTool) ? (
          <>
            <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }} variant="caption">
              Insert
            </Typography>
            <ToggleButtonGroup
              exclusive
              onChange={(_event, value: ToolType | null) => {
                onSelectTool(value ?? 'select');
              }}
              size="small"
              sx={{ alignSelf: 'center', '& .MuiToggleButton-root': toolbarToggleSx }}
              value={currentTool === 'select' ? null : currentTool}
            >
              {[
                ['draw-line', <HorizontalRuleRoundedIcon fontSize="small" />, 'Insert line'],
                ['draw-arrow', <ArrowRightAltRoundedIcon fontSize="small" />, 'Insert arrow'],
                ['draw-text', <TextFieldsRoundedIcon fontSize="small" />, 'Insert text'],
                ['draw-rectangle', <CropSquareRoundedIcon fontSize="small" />, 'Insert rectangle'],
                ['draw-circle', <CircleOutlinedIcon fontSize="small" />, 'Insert circle'],
                ['draw-bezier', <RouteRoundedIcon fontSize="small" />, 'Insert bezier curve'],
              ].map(([tool, icon, title]) => (
                <Tooltip key={String(tool)} title={String(title)}>
                  <ToggleButton aria-label={String(tool)} value={tool}>
                    {icon}
                  </ToggleButton>
                </Tooltip>
              ))}
            </ToggleButtonGroup>
            <Divider flexItem orientation="vertical" />
          </>
        ) : null}
        {currentTool === 'wire' ? (
          <>
            <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }} variant="caption">
              Routing
            </Typography>
            <ToggleButtonGroup
              exclusive
              onChange={(_event, value: WireRoutingMode | null) => {
                if (value) onWireRoutingModeChange(value);
              }}
              size="small"
              sx={{ alignSelf: 'center', '& .MuiToggleButton-root': toolbarToggleSx }}
              value={wireRoutingMode}
            >
              {(['auto', '--', '|-', '-|'] as const).map((mode) => (
                <Tooltip
                  key={mode}
                  title={
                    mode === 'auto'
                      ? 'Wire routing: Auto'
                      : mode === '--'
                        ? 'Wire routing: Straight'
                        : mode === '|-'
                          ? 'Wire routing: Vertical then horizontal'
                          : 'Wire routing: Horizontal then vertical'
                  }
                >
                  <ToggleButton aria-label={mode === 'auto' ? 'Routing auto' : `Routing ${mode}`} value={mode}>
                    <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12 }} variant="caption">
                      {mode === 'auto' ? 'A' : mode}
                    </Typography>
                  </ToggleButton>
                </Tooltip>
              ))}
            </ToggleButtonGroup>
            <Tooltip title="Snap wire to pins">
              <ToggleButton
                aria-label="Pin snap"
                onClick={() => onTogglePinSnap(!pinSnapEnabled)}
                selected={pinSnapEnabled}
                size="small"
                sx={toolbarToggleSx}
                value="pin-snap"
              >
                <AccountTreeRoundedIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Divider flexItem orientation="vertical" />
          </>
        ) : null}
        {currentTool === 'move' ? (
          <>
            <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }} variant="caption">
              View
            </Typography>
            <Tooltip title="Zoom out">
              <Button aria-label="Zoom out" onClick={onZoomOut} size="small" sx={toolbarButtonSx} variant="outlined">
                <ZoomOutRoundedIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Zoom in">
              <Button aria-label="Zoom in" onClick={onZoomIn} size="small" sx={toolbarButtonSx} variant="outlined">
                <ZoomInRoundedIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Fit to screen">
              <Button aria-label="Fit to screen" onClick={onFitToScreen} size="small" sx={toolbarButtonSx} variant="outlined">
                <FitScreenRoundedIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Divider flexItem orientation="vertical" />
          </>
        ) : null}
        {currentTool === 'delete' ? (
          <>
            <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }} variant="caption">
              Delete
            </Typography>
            <Button color="error" onClick={onClear} size="small" startIcon={<DeleteSweepRoundedIcon fontSize="small" />} variant="outlined">
              Delete all
            </Button>
            <Divider flexItem orientation="vertical" />
          </>
        ) : null}
        <Box sx={{ ml: 'auto' }} />
        <Tooltip title="Undo last change">
          <Button aria-label="Undo" onClick={onUndo} size="small" sx={toolbarButtonSx} variant="outlined">
            <UndoRoundedIcon fontSize="small" />
          </Button>
        </Tooltip>
        <Tooltip title="Show grid">
          <ToggleButton
            aria-label="Show grid"
            onClick={() => onToggleGridVisible(!gridVisible)}
            selected={gridVisible}
            size="small"
            sx={toolbarToggleSx}
            value="grid"
          >
            <Grid4x4RoundedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={themeMode === 'dark' ? 'Toggle dark mode' : 'Toggle light mode'}>
          <ToggleButton aria-label="Theme mode" onClick={onToggleThemeMode} selected={themeMode === 'dark'} size="small" sx={toolbarToggleSx} value="theme-mode">
            {themeMode === 'dark' ? <DarkModeRoundedIcon fontSize="small" /> : <LightModeRoundedIcon fontSize="small" />}
          </ToggleButton>
        </Tooltip>
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
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['In Use']);
  const [inUseDefIds, setInUseDefIds] = useState<string[]>([]);
  const defs = useMemo(() => handle?.registry.getAll() ?? [], [handle]);
  const queryLower = query.trim().toLowerCase();

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

  useEffect(() => {
    if (!handle) return;
    const syncInUse = () => setInUseDefIds(handle.getInUseDefIds());
    syncInUse();
    const unsubBody = handle.onBodyChange(syncInUse);
    const unsubDocument = handle.onDocumentChange(syncInUse);
    const unsubLatex = handle.onLatexEdited(syncInUse);
    return () => {
      unsubBody();
      unsubDocument();
      unsubLatex();
    };
  }, [handle]);

  const filtered = queryLower
    ? defs.filter((def) =>
        def.displayName.toLowerCase().includes(queryLower) ||
        def.tikzName.toLowerCase().includes(queryLower) ||
        (def.group ?? '').toLowerCase().includes(queryLower),
      )
    : defs;

  const defsById = useMemo(() => new Map(defs.map((def) => [def.id, def])), [defs]);
  const inUseDefs = useMemo(
    () => inUseDefIds.map((id) => defsById.get(id)).filter(Boolean) as ComponentDef[],
    [defsById, inUseDefIds],
  );

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

  const renderLibraryButton = (def: ComponentDef) => (
    <LibraryItemButton
      currentDefId={currentDefId}
      def={def}
      handle={handle}
      key={def.id}
      onActivate={() => {
        onSelectTool(toolForDef(def), def.id);
      }}
    />
  );

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => (
      prev.includes(groupName)
        ? prev.filter((name) => name !== groupName)
        : [...prev, groupName]
    ));
  };

  return (
    <Box id="palette" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', p: 1 }}>
      <TextField
        fullWidth
        InputProps={{
          startAdornment: <SearchRoundedIcon color="action" fontSize="small" sx={{ mr: 1 }} />,
        }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search component…"
        size="small"
        value={query}
      />
      <Box
        onWheel={forwardWheelToList}
        ref={listRef}
        sx={{
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1.5,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          mt: 1,
          overflowX: 'hidden',
          overflowY: 'auto',
          p: 0.75,
          pr: 0.5,
          position: 'relative',
        }}
      >
        {!queryLower && inUseDefs.length > 0 ? (
          <LibrarySection
            expanded={expandedGroups.includes('In Use')}
            groupName="In Use"
            onToggle={() => toggleGroup('In Use')}
          >
            <Stack spacing={0.5}>
              {inUseDefs.map(renderLibraryButton)}
            </Stack>
          </LibrarySection>
        ) : null}
        {orderedGroups.map((groupName) => (
          <LibrarySection
            expanded={queryLower ? true : expandedGroups.includes(groupName)}
            groupName={groupName}
            key={groupName}
            onToggle={() => toggleGroup(groupName)}
          >
            <Stack spacing={0.5}>
              {groups.get(groupName)?.map(renderLibraryButton)}
            </Stack>
          </LibrarySection>
        ))}
      </Box>
    </Box>
  );
}

function LibrarySection({
  children,
  expanded,
  groupName,
  onToggle,
}: {
  children: ReactNode;
  expanded: boolean;
  groupName: string;
  onToggle: () => void;
}) {
  return (
    <Box
      data-library-group={groupName}
      sx={{
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        mb: 0.5,
        overflow: 'hidden',
      }}
    >
      <Button
        data-library-group-header
        fullWidth
        onClick={onToggle}
        sx={{
          bgcolor: 'action.hover',
          borderBottom: expanded ? 1 : 0,
          borderColor: 'divider',
          borderRadius: 0,
          color: 'text.secondary',
          justifyContent: 'space-between',
          minHeight: 36,
          px: 1,
          py: 0.25,
          textTransform: 'none',
        }}
        variant="text"
      >
        <Typography
          sx={{
            color: 'inherit',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textAlign: 'left',
            textTransform: 'uppercase',
          }}
          variant="overline"
        >
          {groupName}
        </Typography>
        <ExpandMoreRoundedIcon
          fontSize="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </Button>
      {expanded ? <Box sx={{ px: 0.5, pt: 0.5, pb: 0.5 }}>{children}</Box> : null}
    </Box>
  );
}

function LibraryItemButton({
  currentDefId,
  def,
  handle,
  onActivate,
}: {
  currentDefId?: string;
  def: ComponentDef;
  handle: ImperativeAppHandle | null;
  onActivate: () => void;
}) {
  return (
    <Tooltip
      arrow
      enterDelay={1000}
      placement="right"
      title={<LibraryTooltipContent def={def} handle={handle} />}
    >
      <Button
        color={currentDefId === def.id ? 'primary' : 'inherit'}
        onClick={onActivate}
        sx={{
          alignItems: 'center',
          borderColor: currentDefId === def.id ? undefined : 'divider',
          display: 'flex',
          flexDirection: 'row',
          gap: 0.75,
          justifyContent: 'space-between',
          minHeight: 40,
          px: 1,
          py: 0.625,
          textAlign: 'left',
          textTransform: 'none',
          width: '100%',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
        }}
        variant={currentDefId === def.id ? 'contained' : 'outlined'}
      >
        <Typography
          sx={{
            display: '-webkit-box',
            flex: 1,
            fontSize: 13,
            lineHeight: 1.2,
            mr: 1,
            overflow: 'hidden',
            textAlign: 'left',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            wordBreak: 'break-word',
          }}
          variant="body2"
        >
          {def.displayName}
        </Typography>
        {def.shortcut ? <Chip label={def.shortcut.toUpperCase()} size="small" variant="outlined" /> : null}
      </Button>
    </Tooltip>
  );
}

function LibraryTooltipContent({
  def,
  handle,
}: {
  def: ComponentDef;
  handle: ImperativeAppHandle | null;
}) {
  const [, forceRender] = useState(0);
  const probe = useMemo(
    () => handle?.getLibraryPreviewProbe(def.id, () => forceRender((value) => value + 1)) ?? null,
    [def.id, handle],
  );
  const previewMarkup = useMemo(
    () => (probe?.svgMarkup ? namespaceInlineSvg(probe.svgMarkup, `library-${def.id}`) : null),
    [def.id, probe?.svgMarkup],
  );

  return (
    <Box sx={{ maxWidth: 260, p: 0.5 }}>
      <Typography sx={{ fontWeight: 700 }} variant="body2">
        {def.displayName}
      </Typography>
      <Typography sx={{ fontFamily: '"Roboto Mono", monospace', opacity: 0.8 }} variant="caption">
        {def.tikzName}
      </Typography>
      <Box
        sx={{
          alignItems: 'center',
          bgcolor: 'common.white',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          display: 'flex',
          height: 112,
          justifyContent: 'center',
          mt: 1,
          overflow: 'hidden',
          px: 1,
        }}
      >
        {previewMarkup ? (
          <Box
            dangerouslySetInnerHTML={{ __html: previewMarkup }}
            sx={{
              '& svg': {
                display: 'block',
                height: 'auto',
                maxHeight: '96px',
                maxWidth: '100%',
                overflow: 'visible',
                width: '100%',
              },
            }}
          />
        ) : (
          <Typography color="text.secondary" variant="caption">
            Rendering preview…
          </Typography>
        )}
      </Box>
      {def.group ? (
        <Typography sx={{ display: 'block', mt: 0.75, opacity: 0.75 }} variant="caption">
          {def.group}
        </Typography>
      ) : null}
    </Box>
  );
}

function PropertiesView({
  documentVersion,
  gridPitch,
  handle,
  preamble,
  selectedIds,
  setGridPitch,
  setPreamble,
  stopShortcutPropagation,
}: {
  documentVersion: number;
  gridPitch: number;
  handle: ImperativeAppHandle | null;
  preamble: string;
  selectedIds: string[];
  setGridPitch: (value: number) => void;
  setPreamble: (value: string) => void;
  stopShortcutPropagation: (e: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  if (!handle) return <Box id="props" sx={{ flex: 1 }} />;

  const selectionId = selectedIds[0];
  const selectionCount = selectedIds.length;
  const comp = handle.getSelectedComponent();
  const drawing = handle.getSelectedDrawing();
  const wire = handle.getSelectedWire();
  const [draftPreamble, setDraftPreamble] = useState(preamble);
  const [draftComponentProps, setDraftComponentProps] = useState({
    current: comp?.props.current ?? '',
    label: comp?.props.label ?? '',
    value: comp?.props.value ?? '',
    voltage: comp?.props.voltage ?? '',
  });
  const [draftDrawingProps, setDraftDrawingProps] = useState({
    options: drawing?.props.options ?? '',
    text: drawing?.props.text ?? '',
  });

  useEffect(() => {
    setDraftPreamble(preamble);
  }, [preamble, selectionCount]);

  useEffect(() => {
    setDraftComponentProps({
      current: comp?.props.current ?? '',
      label: comp?.props.label ?? '',
      value: comp?.props.value ?? '',
      voltage: comp?.props.voltage ?? '',
    });
  }, [comp?.id, comp?.props.current, comp?.props.label, comp?.props.value, comp?.props.voltage, documentVersion]);

  useEffect(() => {
    setDraftDrawingProps({
      options: drawing?.props.options ?? '',
      text: drawing?.props.text ?? '',
    });
  }, [drawing?.id, drawing?.props.options, drawing?.props.text, documentVersion]);

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

  const updateDrawingProps = (props: Record<string, string | undefined>) => {
    if (!selectionId) return;
    handle.updateDrawingProps(selectionId, props);
    handle.commitDocumentChange();
  };

  const commitPreamble = () => {
    if (draftPreamble === preamble) return;
    setPreamble(draftPreamble);
  };

  const commitComponentProp = (key: keyof typeof draftComponentProps) => {
    if (!comp) return;
    const nextValue = draftComponentProps[key] || undefined;
    const currentValue = comp.props[key] ?? undefined;
    if (nextValue === currentValue) return;
    updateComponentProps({ [key]: nextValue });
  };

  const commitDrawingProp = (key: keyof typeof draftDrawingProps) => {
    if (!drawing) return;
    const nextValue = draftDrawingProps[key] || undefined;
    const currentValue = drawing.props[key] ?? undefined;
    if (nextValue === currentValue) return;
    updateDrawingProps({ [key]: nextValue });
  };

  return (
    <Stack data-version={documentVersion} id="props" spacing={1.5} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
      {selectionCount === 0 ? (
        <>
          <FormControl fullWidth size="small">
            <Select
              displayEmpty
              onChange={(event) => setGridPitch(Number(event.target.value))}
              renderValue={(value) => `Grid pitch: ${value}`}
              value={String(gridPitch)}
            >
              <MenuItem value="0.25">0.25</MenuItem>
              <MenuItem value="0.5">0.5</MenuItem>
              <MenuItem value="1">1</MenuItem>
              <MenuItem value="2">2</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Preamble"
            multiline
            onBlur={commitPreamble}
            onChange={(event) => setDraftPreamble(event.target.value)}
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
            value={draftPreamble}
            variant="outlined"
          />
        </>
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

      {selectionCount === 1 && drawing ? (
        <>
          {drawing.kind === 'text' ? (
            <TextField
              fullWidth
              label="Text"
              onBlur={() => commitDrawingProp('text')}
              onChange={(event) => setDraftDrawingProps((prev) => ({ ...prev, text: event.target.value }))}
              onKeyDown={stopShortcutPropagation}
              size="small"
              value={draftDrawingProps.text}
            />
          ) : null}
          {drawing.kind === 'circle' ? (
            <TextField
              disabled
              fullWidth
              label="Radius"
              size="small"
              value={String(drawing.radius)}
            />
          ) : null}
          {drawing.kind !== 'text' ? (
            <TextField
              fullWidth
              label="TikZ options"
              onBlur={() => commitDrawingProp('options')}
              onChange={(event) => setDraftDrawingProps((prev) => ({ ...prev, options: event.target.value }))}
              onKeyDown={stopShortcutPropagation}
              placeholder={drawing.kind === 'arrow' ? '->, thick' : 'thin'}
              size="small"
              value={draftDrawingProps.options}
            />
          ) : null}
          <Typography color="text.secondary" variant="caption">
            Edit geometry directly on the canvas by selecting and dragging.
          </Typography>
        </>
      ) : null}

      {selectionCount === 1 && comp ? (
        <>
          {comp.type === 'bipole' ? (
            <>
              <TextField
                fullWidth
                label="Label"
                onBlur={() => commitComponentProp('label')}
                onChange={(event) => setDraftComponentProps((prev) => ({ ...prev, label: event.target.value }))}
                onKeyDown={stopShortcutPropagation}
                placeholder="$R_1$"
                size="small"
                value={draftComponentProps.label}
              />
              <TextField
                fullWidth
                label="Voltage (v=)"
                onBlur={() => commitComponentProp('voltage')}
                onChange={(event) => setDraftComponentProps((prev) => ({ ...prev, voltage: event.target.value }))}
                onKeyDown={stopShortcutPropagation}
                size="small"
                value={draftComponentProps.voltage}
              />
              <TextField
                fullWidth
                label="Current (i=)"
                onBlur={() => commitComponentProp('current')}
                onChange={(event) => setDraftComponentProps((prev) => ({ ...prev, current: event.target.value }))}
                onKeyDown={stopShortcutPropagation}
                size="small"
                value={draftComponentProps.current}
              />
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

          {comp.type !== 'bipole' ? (
            <Typography color="text.secondary" variant="caption">
              No editable properties are wired yet for this component type. Selection and placement are supported; advanced options still need explicit emitter support.
            </Typography>
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
  const [currentTool, setCurrentTool] = useState<ToolType>('move');
  const [currentDefId, setCurrentDefId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [gridVisible, setGridVisible] = useState(true);
  const [gridPitch, setGridPitch] = useState(0.5);
  const [pinSnapEnabled, setPinSnapEnabled] = useState(true);
  const [wireRoutingMode, setWireRoutingMode] = useState<WireRoutingMode>('auto');
  const documentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!handle) return;
    const currentToolState = handle.getCurrentTool();
    setCurrentTool(currentToolState.tool);
    setCurrentDefId(currentToolState.defId);
    setSelectedIds(handle.getSelectedIds());
    setPreamble(handle.getPreamble());
    setBody(handle.getBody());
    setGridVisible(handle.getGridVisible());
    setGridPitch(handle.getGridPitch());
    setPinSnapEnabled(handle.getPinSnapEnabled());
    setWireRoutingMode(handle.getWireRoutingMode());

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

  const onToggleGridVisible = (checked: boolean) => {
    setGridVisible(checked);
    handle?.setGridVisible(checked);
  };

  const onTogglePinSnap = (checked: boolean) => {
    setPinSnapEnabled(checked);
    handle?.setPinSnapEnabled(checked);
  };

  const onGridPitchChange = (value: number) => {
    setGridPitch(value);
    handle?.setGridPitch(value);
  };

  const onUndo = () => {
    handle?.undo();
  };

  const onZoomIn = () => {
    handle?.zoomIn();
  };

  const onZoomOut = () => {
    handle?.zoomOut();
  };

  const onFitToScreen = () => {
    handle?.fitToScreen();
  };

  const onWireRoutingModeChange = (mode: WireRoutingMode) => {
    setWireRoutingMode(mode);
    handle?.setWireRoutingMode(mode);
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
    gridVisible,
    gridPitch,
    onClear,
    onCopy,
    onDownloadSvg,
    onFitToScreen,
    onGridPitchChange,
    onSelectTool,
    onToggleGridVisible,
    onTogglePinSnap,
    onUndo,
    onWireRoutingModeChange,
    onZoomIn,
    onZoomOut,
    pinSnapEnabled,
    preamble,
    selectedIds,
    setBody,
    setPreamble,
    stopShortcutPropagation,
    wireRoutingMode,
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
  gridVisible,
  gridPitch,
  handle,
  pinSnapEnabled,
}: {
  currentTool: ToolType;
  gridVisible: boolean;
  gridPitch: number;
  handle: ImperativeAppHandle | null;
  pinSnapEnabled: boolean;
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
    : currentTool === 'move'
      ? 'Move'
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
        {`X: ${formatGridCoord(coords.x, gridPitch)}  Y: ${formatGridCoord(coords.y, gridPitch)}`}
      </Typography>
      <Typography variant="caption">{`Grid: ${formatGridCoord(gridPitch, gridPitch)} ${gridVisible ? '' : '(hidden)'}`}</Typography>
      <Typography variant="caption">{`Pin snap: ${pinSnapEnabled ? 'On' : 'Off'}`}</Typography>
      <Typography variant="caption">{`Zoom: ${zoomPercent}%`}</Typography>
      <Typography variant="caption">{toolLabel}</Typography>
    </Paper>
  );
}

function AppShell({
  handle,
  onToggleThemeMode,
  themeMode,
}: {
  handle: ImperativeAppHandle | null;
  onToggleThemeMode: () => void;
  themeMode: 'light' | 'dark';
}) {
  const appState = useAppState(handle);
  const [collapsed, setCollapsed] = useState({
    document: false,
    library: false,
    props: false,
  });
  const selectedCount = appState.selectedIds.length;
  const selectedComponent = handle?.getSelectedComponent();
  const selectedDrawing = handle?.getSelectedDrawing();
  const selectedWire = handle?.getSelectedWire();
  const propertiesTitle = selectedCount === 0
    ? 'Properties: Document'
    : selectedCount > 1
      ? `Properties: ${selectedCount} Selected`
      : selectedWire
        ? 'Properties: Wire'
        : selectedDrawing
          ? `Properties: ${selectedDrawing.kind[0].toUpperCase()}${selectedDrawing.kind.slice(1)}`
        : `Properties: ${handle?.registry.get(selectedComponent?.defId ?? '')?.displayName ?? selectedComponent?.defId ?? 'Component'}`;

  return (
    <>
      <ToolbarView
        currentTool={appState.currentTool}
        gridVisible={appState.gridVisible}
        onClear={appState.onClear}
        onFitToScreen={appState.onFitToScreen}
        onSelectTool={appState.onSelectTool}
        onToggleGridVisible={appState.onToggleGridVisible}
        onTogglePinSnap={appState.onTogglePinSnap}
        onToggleThemeMode={onToggleThemeMode}
        onUndo={appState.onUndo}
        onWireRoutingModeChange={appState.onWireRoutingModeChange}
        onZoomIn={appState.onZoomIn}
        onZoomOut={appState.onZoomOut}
        pinSnapEnabled={appState.pinSnapEnabled}
        themeMode={themeMode}
        wireRoutingMode={appState.wireRoutingMode}
      />

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
          grow
          onChange={() => setCollapsed((prev) => ({ ...prev, props: !prev.props }))}
          title={propertiesTitle}
        >
          <PropertiesView
            documentVersion={appState.documentVersion}
            gridPitch={appState.gridPitch}
            handle={handle}
            preamble={appState.preamble}
            selectedIds={appState.selectedIds}
            setGridPitch={appState.onGridPitchChange}
            setPreamble={appState.setPreamble}
            stopShortcutPropagation={appState.stopShortcutPropagation}
          />
        </PanelSection>

        <PanelSection
          actions={
            <>
              <Button onClick={() => void appState.onCopy()} size="small" startIcon={<DataObjectRoundedIcon fontSize="small" />} variant="outlined">
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

      <StatusBarView
        currentTool={appState.currentTool}
        gridVisible={appState.gridVisible}
        gridPitch={appState.gridPitch}
        handle={handle}
        pinSnapEnabled={appState.pinSnapEnabled}
      />
    </>
  );
}

export function App() {
  const [handle, setHandle] = useState<ImperativeAppHandle | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const stored = window.localStorage.getItem('theme-mode');
    return stored === 'light' ? 'light' : 'dark';
  });
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
    window.localStorage.setItem('theme-mode', themeMode);
  }, [themeMode]);

  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <>
        <AppShell
          handle={handle}
          onToggleThemeMode={() => setThemeMode((mode) => mode === 'dark' ? 'light' : 'dark')}
          themeMode={themeMode}
        />
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
