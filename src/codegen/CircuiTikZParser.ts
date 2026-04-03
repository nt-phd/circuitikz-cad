/**
 * CircuiTikZParser — parses a \begin{tikzpicture}...\end{tikzpicture} block
 * and reconstructs a CircuitDocument from it.
 *
 * Supported syntax:
 *   \draw (x,y) to[tikzName, opts...] (x2,y2);   → BipoleInstance
 *   \draw (x,y) node[tikzName] {};                → MonopoleInstance
 *   \draw (x,y) -- (x2,y2) -- ...;               → WireInstance
 *
 * Coordinate convention: TikZ uses Y-up → we negate Y when storing in GridPoint.
 */

import type { GridPoint, BipoleInstance, MonopoleInstance, WireInstance, ComponentProps, TerminalMark } from '../types';
import type { CircuitDocument } from '../model/CircuitDocument';
import type { ComponentRegistry } from '../definitions/ComponentRegistry';
import { uid } from '../utils/uid';

// ─── helpers ───────────────────────────────────────────────────────────────

/** Parse "(x,y)" → GridPoint (flipping Y back to screen coords) */
function parseCoord(s: string): GridPoint | null {
  const m = s.match(/\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: -parseFloat(m[2]) }; // flip Y
}

/** Strip outer $…$ or plain text label */
function cleanLabel(s: string): string {
  s = s.trim();
  if (s.startsWith('$') && s.endsWith('$')) return s; // keep math mode as-is
  return s;
}

/** Parse terminal marker string like "*-o", "-*", etc. */
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

/** Extract key=value pairs from options list */
function extractKV(opts: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const opt of opts) {
    const m = opt.trim().match(/^([a-zA-Z_]+)\s*=\s*(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

/**
 * Split a to[...] options string by commas, respecting nested braces/brackets.
 */
function splitOptions(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ─── main parser ────────────────────────────────────────────────────────────

export function parseCircuiTikZ(
  source: string,
  doc: CircuitDocument,
  registry: ComponentRegistry,
): void {
  // Build a tikzName → defId lookup
  const tikzToDefId = new Map<string, string>();
  for (const def of registry.getAll()) {
    if (!tikzToDefId.has(def.tikzName)) {
      tikzToDefId.set(def.tikzName, def.id);
    }
  }

  doc.clear();

  // Normalize: remove comments, collapse whitespace but keep line structure
  const lines = source
    .split('\n')
    .map(l => l.replace(/%.*$/, '').trim())
    .filter(Boolean);

  // Join into one string, then split on ';' to get draw statements
  const joined = lines.join(' ');
  const statements = joined.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    // Strip leading \draw or \draw[...]
    const drawMatch = stmt.match(/^\\draw(?:\[.*?\])?\s+(.+)$/s);
    if (!drawMatch) continue;
    const body = drawMatch[1].trim();

    // ── Wire: only contains coordinates and -- ────────────────────────────
    // e.g. (0,0) -- (2,0) -- (2,-2)
    if (/^\(.*\)(\s*--\s*\(.*\))+$/.test(body)) {
      const coordStrings = body.split('--').map(s => s.trim());
      const points: GridPoint[] = [];
      for (const cs of coordStrings) {
        const pt = parseCoord(cs);
        if (pt) points.push(pt);
      }
      if (points.length >= 2) {
        const wire: WireInstance = { id: uid(), points, junctions: new Map() };
        doc.addWire(wire);
      }
      continue;
    }

    // ── Monopole / node: (x,y) node[name] {} ─────────────────────────────
    const nodeMatch = body.match(/^\(([-\d.]+)\s*,\s*([-\d.]+)\)\s+node\[([^\]]+)\]\s*\{\s*\}$/);
    if (nodeMatch) {
      const position: GridPoint = { x: parseFloat(nodeMatch[1]), y: -parseFloat(nodeMatch[2]) };
      const tikzName = nodeMatch[3].trim();
      const defId = tikzToDefId.get(tikzName);
      if (defId) {
        const comp: MonopoleInstance = {
          id: uid(), defId, type: 'monopole',
          position, rotation: 0, props: {},
        };
        doc.addComponent(comp);
      }
      continue;
    }

    // ── Bipole: (x,y) to[opts] (x2,y2) ──────────────────────────────────
    const bipoleMatch = body.match(/^(\([-\d.]+\s*,\s*[-\d.]+\))\s+to\[([^\]]+)\]\s+(\([-\d.]+\s*,\s*[-\d.]+\))$/);
    if (bipoleMatch) {
      const start = parseCoord(bipoleMatch[1]);
      const end   = parseCoord(bipoleMatch[3]);
      if (!start || !end) continue;

      const rawOpts = splitOptions(bipoleMatch[2]);
      const tikzName = rawOpts[0]?.trim();
      const defId = tikzToDefId.get(tikzName);
      if (!defId) continue;

      const rest = rawOpts.slice(1);
      const kv = extractKV(rest);
      const terminals = parseTerminals(rest);

      const props: ComponentProps = {
        ...terminals,
        label:   kv['l']  ? cleanLabel(kv['l'])  : undefined,
        voltage: kv['v']  ? cleanLabel(kv['v'])  : undefined,
        current: kv['i']  ? cleanLabel(kv['i'])  : undefined,
      };

      const comp: BipoleInstance = { id: uid(), defId, type: 'bipole', start, end, props };
      doc.addComponent(comp);
      continue;
    }
  }
}
