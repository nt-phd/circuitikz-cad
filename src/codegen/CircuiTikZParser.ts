/**
 * CircuiTikZParser — parses a tikzpicture body into CircuitDocument.
 *
 * Each parsed element stores the line number in the source body so that:
 *  - IDs are stable across re-parses (based on line index, not random)
 *  - The CodePanel can highlight the corresponding source line on selection
 *
 * Supported syntax:
 *   \draw (x,y) to[tikzName, opts...] (x2,y2);   → BipoleInstance
 *   \draw (x,y) node[tikzName] {};                → Monopole/Node instance
 *   \node[tikzName,...] at (x,y) {};              → Monopole/Node instance
 *   \draw (x,y) -- (x2,y2) -- ...;               → WireInstance
 */

import type {
  ConnectionRef,
  GridPoint,
  BipoleInstance,
  MonopoleInstance,
  NodeInstance,
  WireInstance,
  ComponentProps,
  TerminalMark,
  DrawingInstance,
} from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import { getComponentAnchorPoints } from '../canvas/ConnectionAnchors';

// ─── helpers ───────────────────────────────────────────────────────────────

function parseCoord(s: string): GridPoint | null {
  const m = s.match(/\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: -parseFloat(m[2]) };
}

function parseReference(s: string): { nodeName: string; anchor: string } | null {
  const m = s.match(/\(\s*([A-Za-z][\w]*)\.([^)]+)\s*\)/);
  if (!m) return null;
  return { nodeName: m[1], anchor: m[2].trim() };
}

function resolveEndpoint(
  token: string,
  doc: CircuitDocument,
  registry: ComponentRegistry,
): { point: GridPoint; ref?: ConnectionRef } | null {
  const coord = parseCoord(token);
  if (coord) return { point: coord };
  const ref = parseReference(token);
  if (!ref) return null;
  const comp = doc.getComponentByNodeName(ref.nodeName);
  if (!comp) return null;
  const def = registry.get(comp.defId);
  if (!def) return null;
  const match = getComponentAnchorPoints(comp, def).find((anchor) => anchor.ref?.anchor === ref.anchor);
  if (!match) return null;
  return {
    point: match.point,
    ref: {
      componentId: comp.id,
      nodeName: ref.nodeName,
      anchor: ref.anchor,
    },
  };
}

function expandWirePath(points: Array<{ point: GridPoint; ref?: ConnectionRef }>, operators: Array<'--' | '|-' | '-|'>): {
  endRef?: ConnectionRef;
  points: GridPoint[];
  startRef?: ConnectionRef;
} {
  const expanded: GridPoint[] = [points[0].point];
  for (let i = 0; i < operators.length; i++) {
    const a = points[i].point;
    const b = points[i + 1].point;
    const op = operators[i];
    if (op === '--') {
      expanded.push(b);
      continue;
    }
    if (op === '|-') {
      expanded.push({ x: a.x, y: b.y });
      expanded.push(b);
      continue;
    }
    expanded.push({ x: b.x, y: a.y });
    expanded.push(b);
  }
  return {
    points: expanded,
    startRef: points[0].ref,
    endRef: points[points.length - 1].ref,
  };
}

function parseWireStatement(
  body: string,
  doc: CircuitDocument,
  registry: ComponentRegistry,
): { endRef?: ConnectionRef; operators?: Array<'--' | '|-' | '-|'>; pathPoints?: GridPoint[]; points: GridPoint[]; startRef?: ConnectionRef } | null {
  const operators = [...body.matchAll(/(--|\|-|-\|)/g)].map((match) => match[1] as '--' | '|-' | '-|');
  if (operators.length === 0) return null;
  const tokens = body.split(/\s*(?:--|\|-|-\|)\s*/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length !== operators.length + 1) return null;
  const resolved = tokens.map((token) => resolveEndpoint(token, doc, registry));
  if (resolved.some((token) => !token)) return null;
  const endpoints = resolved as Array<{ point: GridPoint; ref?: ConnectionRef }>;
  const expanded = expandWirePath(endpoints, operators);
  return {
    points: expanded.points,
    pathPoints: endpoints.map((endpoint) => endpoint.point),
    startRef: expanded.startRef,
    endRef: expanded.endRef,
    operators,
  };
}

function parseDrawingStatement(body: string, drawOptions: string | undefined): DrawingInstance | null {
  const normalizedOpts = (drawOptions ?? '').trim();
  const options = normalizedOpts || undefined;

  const bezierMatch = body.match(/^(\([^)]+\))\s*\.\.\s*controls\s*(\([^)]+\))\s*and\s*(\([^)]+\))\s*\.\.\s*(\([^)]+\))$/);
  if (bezierMatch) {
    const start = parseCoord(bezierMatch[1]);
    const control1 = parseCoord(bezierMatch[2]);
    const control2 = parseCoord(bezierMatch[3]);
    const end = parseCoord(bezierMatch[4]);
    if (start && control1 && control2 && end) {
      return { id: '', kind: 'bezier', start, control1, control2, end, props: { options } };
    }
  }

  const rectMatch = body.match(/^(\([^)]+\))\s+rectangle\s+(\([^)]+\))$/);
  if (rectMatch) {
    const start = parseCoord(rectMatch[1]);
    const end = parseCoord(rectMatch[2]);
    if (start && end) return { id: '', kind: 'rectangle', start, end, props: { options } };
  }

  const circleMatch = body.match(/^(\([^)]+\))\s+circle\s*\(\s*([-\d.]+)\s*\)$/);
  if (circleMatch) {
    const center = parseCoord(circleMatch[1]);
    const radius = Number.parseFloat(circleMatch[2]);
    if (center && Number.isFinite(radius)) return { id: '', kind: 'circle', center, radius, props: { options } };
  }

  const simplePathMatch = body.match(/^(\([^)]+\))\s*(--)\s*(\([^)]+\))$/);
  if (simplePathMatch && normalizedOpts) {
    const start = parseCoord(simplePathMatch[1]);
    const end = parseCoord(simplePathMatch[3]);
    if (start && end) {
      const kind = normalizedOpts.includes('->') ? 'arrow' : 'line';
      return { id: '', kind, start, end, props: { options } };
    }
  }

  const textNodeMatch = body.match(/^node(?:\[[^\]]*\])?\s+at\s+(\([^)]+\))\s*\{([\s\S]*)\}$/);
  if (textNodeMatch) {
    const position = parseCoord(textNodeMatch[1]);
    if (position) return { id: '', kind: 'text', position, props: { text: textNodeMatch[2] } };
  }

  return null;
}

function parseTerminals(opts: string[]): { startTerminal?: TerminalMark; endTerminal?: TerminalMark } {
  for (const opt of opts) {
    const m = opt.trim().match(/^([*o]?)-([*o]?)$/);
    if (m) {
      const toMark = (c: string): TerminalMark =>
        c === '*' ? 'dot' : c === 'o' ? 'open' : 'none';
      return { startTerminal: toMark(m[1]), endTerminal: toMark(m[2]) };
    }
  }
  return {};
}

function extractKV(opts: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const opt of opts) {
    const m = opt.trim().match(/^([a-zA-Z_]+)\s*=\s*(.+)$/);
    if (m) {
      let value = m[2].trim();
      if (value.startsWith('{') && value.endsWith('}')) {
        value = value.slice(1, -1).trim();
      }
      result[m[1]] = value;
    }
  }
  return result;
}

function splitOptions(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function addPlacedComponent(
  doc: CircuitDocument,
  registry: ComponentRegistry,
  tikzToDefId: Map<string, string>,
  id: string,
  tikzName: string,
  position: GridPoint,
  nodeName?: string,
  props: ComponentProps = {},
): void {
  const defId = tikzToDefId.get(tikzName) ?? tikzName;
  const def = registry.get(defId);
  if (def?.placementType === 'node') {
    const comp: NodeInstance = {
      id, defId, type: 'node', nodeName, position, rotation: 0, mirror: 'none', props,
    };
    doc.addComponent(comp);
    return;
  }
  const comp: MonopoleInstance = { id, defId, type: 'monopole', nodeName, position, rotation: 0, props };
  doc.addComponent(comp);
}

// ─── main parser ────────────────────────────────────────────────────────────

/**
 * Parse the tikzpicture body (or full source) into doc.
 * Each element's id encodes its source line index so it is stable
 * across re-parses as long as the source line doesn't change.
 */
export function parseCircuiTikZ(
  source: string,
  doc: CircuitDocument,
  registry: ComponentRegistry,
): void {
  const tikzToDefId = new Map<string, string>();
  for (const def of registry.getAll()) {
    if (!tikzToDefId.has(def.tikzName)) tikzToDefId.set(def.tikzName, def.id);
  }

  doc.clear();

  const rawLines = source.split('\n');

  // Collect multi-line statements: join continuation until ';'
  // Track which source line each statement starts on.
  type Stmt = { text: string; lineIndex: number };
  const statements: Stmt[] = [];
  let buf = '';
  let stmtLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const stripped = rawLines[i].replace(/%.*$/, '').trim();
    if (!stripped || /^\\(begin|end)\b/.test(stripped)) continue;

    if (buf === '') stmtLine = i;
    buf += (buf ? ' ' : '') + stripped;

    if (buf.includes(';')) {
      // May have multiple statements on one logical line
      const parts = buf.split(';');
      for (let p = 0; p < parts.length - 1; p++) {
        const t = parts[p].trim();
        if (t) statements.push({ text: t, lineIndex: stmtLine });
      }
      buf = parts[parts.length - 1].trim();
      if (buf) stmtLine = i;
    }
  }

  for (const { text: stmt, lineIndex } of statements) {
    // Stable ID = 'line:<lineIndex>'
    const id = `line:${lineIndex}`;

    const nodeStmtMatch = stmt.match(/^\\node\s*\[([^\]]+)\](?:\(([^)]+)\))?\s+at\s+(\([^)]+\))\s*\{[\s\S]*?\}(?:\s+node\[(.*?)\]\s+at\s+\(([^)]+)\)\s*\{([\s\S]*?)\})?$/);
    if (nodeStmtMatch) {
      const position = parseCoord(nodeStmtMatch[3]);
      const opts = splitOptions(nodeStmtMatch[1]);
      const tikzName = opts[0]?.trim();
      const extraOptions = opts.slice(1).join(', ').trim() || undefined;
      const textAnchorOpts = nodeStmtMatch[4] ? extractKV(splitOptions(nodeStmtMatch[4])) : {};
      const textTarget = nodeStmtMatch[5]?.trim();
      const text = nodeStmtMatch[6];
      const props: ComponentProps = {
        options: extraOptions,
        text: textTarget?.endsWith('.text') ? text : undefined,
        textAnchor: textTarget?.endsWith('.text') ? (textAnchorOpts.anchor ?? 'center') : undefined,
      };
      if (position && tikzName) addPlacedComponent(doc, registry, tikzToDefId, id, tikzName, position, nodeStmtMatch[2]?.trim(), props);
      continue;
    }

    const textNodeStmtMatch = stmt.match(/^\\node\s+at\s+(\([^)]+\))\s*\{([\s\S]*?)\}$/);
    if (textNodeStmtMatch) {
      const position = parseCoord(textNodeStmtMatch[1]);
      if (position) {
        doc.addDrawing({ id, kind: 'text', position, props: { text: textNodeStmtMatch[2] } });
      }
      continue;
    }

    const drawMatch = stmt.match(/^\\draw(?:\[([^\]]*)\])?\s+(.+)$/s);
    if (!drawMatch) continue;
    const drawOptions = drawMatch[1];
    const body = drawMatch[2].trim();

    const drawing = parseDrawingStatement(body, drawOptions);
    if (drawing) {
      drawing.id = id;
      doc.addDrawing(drawing);
      continue;
    }

    // Wire: coords joined by --
    const wirePath = parseWireStatement(body, doc, registry);
    if (wirePath) {
      if (wirePath.points.length >= 2) {
        const wire: WireInstance = {
          id,
          points: wirePath.points,
          pathPoints: wirePath.pathPoints,
          startRef: wirePath.startRef,
          endRef: wirePath.endRef,
          operators: wirePath.operators,
          junctions: new Map(),
        };
        doc.addWire(wire);
      }
      continue;
    }

    // Monopole/Node: (x,y) node[name] {}
    const nodeMatch = body.match(/^\(([-\d.]+)\s*,\s*([-\d.]+)\)\s+node\[([^\]]+)\]\s*\{[^}]*\}$/);
    if (nodeMatch) {
      const position: GridPoint = { x: parseFloat(nodeMatch[1]), y: -parseFloat(nodeMatch[2]) };
      const opts = splitOptions(nodeMatch[3]);
      const tikzName = opts[0]?.trim();
      if (!tikzName) continue;
      const props: ComponentProps = {
        options: opts.slice(1).join(', ').trim() || undefined,
      };
      addPlacedComponent(doc, registry, tikzToDefId, id, tikzName, position, undefined, props);
      continue;
    }

    // Bipole: (x,y) to[opts] (x2,y2)
    const bipoleMatch = body.match(/^(\([-\d.]+\s*,\s*[-\d.]+\))\s+to\[([^\]]+)\]\s+(\([-\d.]+\s*,\s*[-\d.]+\))$/);
    if (bipoleMatch) {
      const start = parseCoord(bipoleMatch[1]);
      const end   = parseCoord(bipoleMatch[3]);
      if (!start || !end) continue;
      const rawOpts = splitOptions(bipoleMatch[2]);
      const tikzName = rawOpts[0]?.trim();
      const defId = tikzToDefId.get(tikzName) ?? tikzName;
      const rest = rawOpts.slice(1);
      const kv = extractKV(rest);
      const props: ComponentProps = {
        ...parseTerminals(rest),
        label:   kv['l'] ?? undefined,
        voltage: kv['v'] ?? undefined,
        current: kv['i'] ?? undefined,
      };
      const comp: BipoleInstance = { id, defId, type: 'bipole', start, end, props };
      doc.addComponent(comp);
      continue;
    }
  }
}

/**
 * Return the 0-based line index encoded in an element id like 'line:42'.
 * Returns -1 if the id is not in that format.
 */
export function lineIndexFromId(id: string): number {
  const m = id.match(/^line:(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}
