import { isGridLineCell, isMeshGutterNeighbor, isVoidAdjacent } from './cellTypes';
import { applyShadeVisualScale } from './shapes3dVisual';
import type { CellTypeDef, GridCell } from './types';

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

/** Fraction of cell size — modest inset so lines stop just before shapes. */
const MESH_GUTTER_RATIO = 0.08;

function segKey(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 > x2 || (x1 === x2 && y1 > y2)) return `${x2},${y2},${x1},${y1}`;
  return `${x1},${y1},${x2},${y2}`;
}

function getMeshBuffer(cellSize: number): number {
  return cellSize * MESH_GUTTER_RATIO;
}

interface NeighborFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

function neighborFlags(
  grid: GridCell[][],
  typeMap: Map<string, CellTypeDef>,
  col: number,
  row: number,
  cols: number,
  rows: number,
): NeighborFlags {
  const at = (c: number, r: number): boolean => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false;
    return isMeshGutterNeighbor(typeMap.get(grid[r][c].typeId));
  };
  return {
    top: at(col, row - 1),
    bottom: at(col, row + 1),
    left: at(col - 1, row),
    right: at(col + 1, row),
  };
}

function addHorizontal(
  addSeg: (x1: number, y1: number, x2: number, y2: number, stroke?: string, width?: number) => void,
  y: number,
  x0: number,
  x1: number,
  flags: NeighborFlags,
  buffer: number,
  minLen: number,
  stroke?: string,
  width?: number,
): void {
  if (flags.left && flags.right) return;
  const left = x0 + (flags.left ? buffer : 0);
  const right = x1 - (flags.right ? buffer : 0);
  if (right - left >= minLen) addSeg(left, y, right, y, stroke, width);
}

function addVertical(
  addSeg: (x1: number, y1: number, x2: number, y2: number, stroke?: string, width?: number) => void,
  x: number,
  y0: number,
  y1: number,
  flags: NeighborFlags,
  buffer: number,
  minLen: number,
  stroke?: string,
  width?: number,
): void {
  if (flags.top && flags.bottom) return;
  const top = y0 + (flags.top ? buffer : 0);
  const bottom = y1 - (flags.bottom ? buffer : 0);
  if (bottom - top >= minLen) addSeg(x, top, x, bottom, stroke, width);
}

function lineTypeForCell(
  cell: GridCell,
  typeMap: Map<string, CellTypeDef>,
): CellTypeDef | undefined {
  const base = typeMap.get(cell.typeId);
  if (!base) return undefined;
  return cell.shadeBand ? applyShadeVisualScale(base, cell.shadeBand) : base;
}

/**
 * Grid mesh lines centered in each cell — a horizontal and vertical stroke through
 * the cell midpoint. Adjacent grid cells connect into continuous pathways; non-grid
 * neighbors inset the arms with a gutter buffer.
 */
export function collectMeshLines(
  grid: GridCell[][],
  typeMap: Map<string, CellTypeDef>,
  cols: number,
  rows: number,
  cellSize: number,
  stroke: string,
  strokeWidth: number,
  resolveStroke?: (
    col: number,
    row: number,
    cell: GridCell,
    type: CellTypeDef,
  ) => string,
): LineSegment[] {
  const segments = new Map<string, LineSegment>();
  const buffer = getMeshBuffer(cellSize);
  const minLen = cellSize * 0.12;

  const addSeg = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    segStroke = stroke,
    segWidth = strokeWidth,
  ) => {
    const key = segKey(x1, y1, x2, y2);
    const existing = segments.get(key);
    if (!existing || segWidth > existing.strokeWidth) {
      segments.set(key, { x1, y1, x2, y2, stroke: segStroke, strokeWidth: segWidth });
    }
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = lineTypeForCell(cell, typeMap);
      if (!isGridLineCell(type)) continue;
      if (isVoidAdjacent(grid, typeMap, col, row, cols, rows)) continue;

      const x = col * cellSize;
      const y = row * cellSize;
      const s = cellSize;
      const cx = x + s / 2;
      const cy = y + s / 2;
      const flags = neighborFlags(grid, typeMap, col, row, cols, rows);
      const segStroke = resolveStroke
        ? resolveStroke(col, row, cell, type!)
        : type!.stroke;
      const segWidth = type!.strokeWidth;

      if (!(flags.left && flags.right)) {
        addHorizontal(
          addSeg,
          cy,
          x,
          x + s,
          flags,
          buffer,
          minLen,
          segStroke,
          segWidth,
        );
      }

      if (!(flags.top && flags.bottom)) {
        addVertical(
          addSeg,
          cx,
          y,
          y + s,
          flags,
          buffer,
          minLen,
          segStroke,
          segWidth,
        );
      }
    }
  }

  return [...segments.values()];
}

export function segmentsToSvgLines(segments: LineSegment[]): string {
  return segments
    .map(
      (s) =>
        `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`,
    )
    .join('');
}

export function drawSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineSegment[],
): void {
  for (const s of segments) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.strokeWidth;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}
