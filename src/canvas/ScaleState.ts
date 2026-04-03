/**
 * ScaleState — single source of truth for the tikzpicture scale factor.
 *
 * When the body contains \begin{tikzpicture}[scale=0.7], all canvas
 * coordinates must be multiplied by 0.7 to stay aligned with the
 * pdflatex-rendered SVG.
 *
 * effectiveGridSize = BASE_GRID_SIZE × tikzScale
 *
 * All canvas modules (ViewTransform, GhostRenderer, LatexCanvas grid)
 * read from this singleton instead of using the GRID_SIZE constant directly.
 */

import { GRID_SIZE } from '../constants';

export const scaleState = {
  tikzScale: 1.0,

  get effectiveGridSize(): number {
    return GRID_SIZE * this.tikzScale;
  },
};

/**
 * Extract the scale= value from a tikzpicture options string.
 * Handles: [scale=0.7], [scale=1], [european, scale=0.5], etc.
 * Returns 1.0 if not found.
 */
export function extractTikzScale(body: string): number {
  const m = body.match(/\\begin\{tikzpicture\}\s*\[([^\]]*)\]/);
  if (!m) return 1.0;
  const scaleMatch = m[1].match(/\bscale\s*=\s*([\d.]+)/);
  return scaleMatch ? parseFloat(scaleMatch[1]) : 1.0;
}
