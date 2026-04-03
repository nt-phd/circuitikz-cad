/**
 * Formats a label for CircuiTikZ.
 * If already wrapped in $...$, passes through.
 * If contains LaTeX commands (\), wraps in math mode.
 */
export function formatLabel(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('$') && raw.endsWith('$')) return raw;
  if (raw.includes('\\')) return `$${raw}$`;
  return raw;
}
