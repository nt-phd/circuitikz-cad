// ============================================================
// GEOMETRY
// ============================================================

export interface GridPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type Mirror = 'none' | 'horizontal' | 'vertical';

// ============================================================
// COMPONENT DEFINITIONS (static library)
// ============================================================

export type PlacementType = 'bipole' | 'node' | 'monopole';

export interface ComponentDef {
  id: string;
  displayName: string;
  category: 'passive' | 'source' | 'switch' | 'diode' | 'ground' | 'transistor' | 'amplifier' | 'logic' | 'misc';
  placementType: PlacementType;
  /** CircuiTikZ key for code generation */
  tikzName: string;
  /** ID of the <symbol> in symbols.svg, e.g. "path_european-resistor" */
  symbolId: string;
  /**
   * For bipole (path) symbols: distance in symbol SVG units between START and END pins.
   * Used to compute the scale factor when rendering between two grid points.
   * = pin_END.x - pin_START.x  (always positive, in SVG pts)
   */
  symbolPinSpan: number;
  /**
   * For node/monopole symbols: the reference point (x,y) in SVG units
   * is where the component's electrical connection point sits.
   */
  symbolRefX: number;
  symbolRefY: number;
  /** viewBox of the symbol */
  viewBox: string;
  viewBoxW: number;
  viewBoxH: number;
  defaultProps: ComponentProps;
  shortcut?: string;
  /** Original group from symbols.svg, e.g. "Resistive bipoles" */
  group?: string;
}

// ============================================================
// COMPONENT INSTANCES (runtime)
// ============================================================

export type TerminalMark = 'none' | 'dot' | 'open';

export interface ComponentProps {
  label?: string;
  value?: string;
  voltage?: string;
  current?: string;
  startTerminal?: TerminalMark;
  endTerminal?: TerminalMark;
}

export interface BipoleInstance {
  id: string;
  defId: string;
  type: 'bipole';
  start: GridPoint;
  end: GridPoint;
  props: ComponentProps;
}

export interface NodeInstance {
  id: string;
  defId: string;
  type: 'node';
  position: GridPoint;
  rotation: Rotation;
  mirror: Mirror;
  props: ComponentProps;
}

export interface MonopoleInstance {
  id: string;
  defId: string;
  type: 'monopole';
  position: GridPoint;
  rotation: Rotation;
  props: ComponentProps;
}

export type ComponentInstance = BipoleInstance | NodeInstance | MonopoleInstance;

// ============================================================
// WIRES
// ============================================================

export interface WireInstance {
  id: string;
  points: GridPoint[];
  junctions: Map<number, TerminalMark>;
}

// ============================================================
// DOCUMENT
// ============================================================

export interface DocumentMetadata {
  style: 'european' | 'american';
  gridSize: number;
  snapSize: number;
  scale: number;
}

// ============================================================
// TOOLS
// ============================================================

export type ToolType = 'select' | 'place-bipole' | 'place-monopole' | 'place-node' | 'wire' | 'delete';

// ============================================================
// EVENTS
// ============================================================

export type AppEvent =
  | { type: 'component-added'; component: ComponentInstance }
  | { type: 'component-removed'; id: string }
  | { type: 'component-moved'; id: string }
  | { type: 'component-props-changed'; id: string; props: Partial<ComponentProps> }
  | { type: 'wire-added'; wire: WireInstance }
  | { type: 'wire-removed'; id: string }
  | { type: 'selection-changed'; selectedIds: string[] }
  | { type: 'tool-changed'; tool: ToolType; defId?: string }
  | { type: 'style-changed'; style: 'european' | 'american' }
  | { type: 'document-changed' }
  /** Fired when a CAD tool updates LatexDocument.body — CodePanel syncs its textarea. */
  | { type: 'body-changed' }
  /** Fired by CodePanel after debounce when the user finishes editing LaTeX manually. */
  | { type: 'user-edited-latex' };

// ============================================================
// VIEW
// ============================================================

export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}
