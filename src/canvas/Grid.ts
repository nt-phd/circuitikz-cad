import { GRID_SIZE, MAJOR_GRID_EVERY, GRID_COLOR_MINOR, GRID_COLOR_MAJOR } from '../constants';
import { createSvgElement, setAttrs, createRect } from '../utils/svg';
import type { ViewTransform } from './ViewTransform';

export class Grid {
  private patternMinor: SVGPatternElement;
  private patternMajor: SVGPatternElement;
  private gridRect: SVGRectElement;

  constructor(defs: SVGDefsElement, svgRoot: SVGSVGElement) {
    // Minor grid pattern
    this.patternMinor = createSvgElement('pattern', {
      id: 'grid-minor',
      patternUnits: 'userSpaceOnUse',
      width: GRID_SIZE,
      height: GRID_SIZE,
    });
    const minorPath = createSvgElement('path', {
      d: `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`,
      fill: 'none',
      stroke: GRID_COLOR_MINOR,
      'stroke-width': '0.5',
    });
    this.patternMinor.appendChild(minorPath);
    defs.appendChild(this.patternMinor);

    // Major grid pattern
    const majorSize = GRID_SIZE * MAJOR_GRID_EVERY;
    this.patternMajor = createSvgElement('pattern', {
      id: 'grid-major',
      patternUnits: 'userSpaceOnUse',
      width: majorSize,
      height: majorSize,
    });
    const minorFill = createRect(0, 0, majorSize, majorSize, {
      fill: 'url(#grid-minor)',
    });
    this.patternMajor.appendChild(minorFill);
    const majorPath = createSvgElement('path', {
      d: `M ${majorSize} 0 L 0 0 0 ${majorSize}`,
      fill: 'none',
      stroke: GRID_COLOR_MAJOR,
      'stroke-width': '1',
    });
    this.patternMajor.appendChild(majorPath);
    defs.appendChild(this.patternMajor);

    // Full-viewport rect filled with the major pattern
    this.gridRect = createRect(0, 0, 1, 1, { fill: 'url(#grid-major)' });
    // Insert as first child of svg (behind everything)
    if (svgRoot.firstChild) {
      svgRoot.insertBefore(this.gridRect, svgRoot.firstChild);
    } else {
      svgRoot.appendChild(this.gridRect);
    }
    // Move after defs
    svgRoot.insertBefore(this.gridRect, defs.nextSibling);
  }

  update(view: ViewTransform, width: number, height: number): void {
    const cellSize = GRID_SIZE * view.zoom;
    const majorSize = cellSize * MAJOR_GRID_EVERY;

    setAttrs(this.patternMinor, {
      width: cellSize,
      height: cellSize,
      x: view.panX % cellSize,
      y: view.panY % cellSize,
    });

    // Update minor path inside pattern
    const minorPath = this.patternMinor.querySelector('path')!;
    setAttrs(minorPath, { d: `M ${cellSize} 0 L 0 0 0 ${cellSize}` });

    setAttrs(this.patternMajor, {
      width: majorSize,
      height: majorSize,
      x: view.panX % majorSize,
      y: view.panY % majorSize,
    });

    // Update major fill rect and path
    const majorFill = this.patternMajor.querySelector('rect')!;
    setAttrs(majorFill, { width: majorSize, height: majorSize });
    const majorPath = this.patternMajor.querySelector('path')!;
    setAttrs(majorPath, { d: `M ${majorSize} 0 L 0 0 0 ${majorSize}` });

    // Resize grid rect to fill viewport
    setAttrs(this.gridRect, { width, height });
  }
}
