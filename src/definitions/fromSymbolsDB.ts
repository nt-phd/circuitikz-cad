/**
 * Populates the ComponentRegistry from the loaded SymbolsDB.
 * This replaces the hand-coded bipoles/grounds/sources definition files.
 */
import type { ComponentDef, PlacementType } from '../types';
import type { ComponentRegistry } from './ComponentRegistry';
import type { SymbolsDB } from '../data/symbolsDB';

// Internal CircuiTikZ shape aliases that are not valid \draw to[...] commands
const INVALID_TIKZ_NAMES = new Set(['generic', 'xgeneric', 'sgeneric', 'tgeneric', 'ageneric']);

// Map symbolsDB group names → our category names
const GROUP_TO_CATEGORY: Record<string, ComponentDef['category']> = {
  'Resistive bipoles':              'passive',
  'Capacitive and dynamic bipoles': 'passive',
  'Inductors':                      'passive',
  'Mechanical':                     'passive',
  'Diodes':                         'diode',
  'Sources and generators':         'source',
  'Switches, buttons and jumpers':  'switch',
  'Grounds and supply voltages':    'ground',
  'Amplifiers':                     'amplifier',
  'Block diagram':                  'amplifier',
  'Logic gates':                    'logic',
  'RF components':                  'misc',
  'Wiring':                         'misc',
  'Instruments':                    'misc',
  'Miscellaneous':                  'misc',
  'Tubes':                          'misc',
};

export function populateRegistryFromSymbolsDB(
  registry: ComponentRegistry,
  db: SymbolsDB,
): void {
  for (const entry of db.getAllComponents()) {
    const v = entry.defaultVariant;
    if (!v.symbolId) continue;
    if (INVALID_TIKZ_NAMES.has(entry.tikz)) continue;

    // Determine START and END pins for bipoles
    const startPin = v.pins.find(p => p.name === 'START');
    const endPin   = v.pins.find(p => p.name === 'END');

    // placementType
    let placementType: PlacementType;
    if (entry.type === 'path' && startPin && endPin) {
      placementType = 'bipole';
    } else if (entry.type === 'node') {
      placementType = 'monopole';
    } else {
      continue; // skip path symbols without clear pins
    }

    const category: ComponentDef['category'] =
      GROUP_TO_CATEGORY[entry.group] ?? 'misc';

    // For bipoles: pin START absolute x = refX + pinStart.x
    // (pins in symbolsDB are stored as offsets from refX)
    const symbolPinSpan = placementType === 'bipole'
      ? (v.refX + endPin!.x) - (v.refX + startPin!.x)   // = endPin.x - startPin.x
      : 0;

    const def: ComponentDef = {
      id: v.symbolId,
      displayName: entry.display,
      category,
      placementType,
      tikzName: entry.tikz,
      symbolId: v.symbolId,
      symbolPinSpan,
      symbolRefX: v.refX,
      symbolRefY: v.refY,
      viewBox: v.viewBox,
      viewBoxW: v.viewBoxWidth,
      viewBoxH: v.viewBoxHeight,
      defaultProps: {},
      group: entry.group,
    };

    registry.register(def);
  }
}
