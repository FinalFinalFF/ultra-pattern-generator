import { hashSeed, SimplexNoise } from './noise';
import { BLOCK_COLOR_WEIGHTS, BLOCK_PALETTE } from './brandColors';
import type { ColorBlock, ColorSchemeId } from './types';

function seededUnit(seed: string, key: string): number {
  return hashSeed(`${seed}:blocks:${key}`) / 0xffffffff;
}

/**
 * Smallest block edge, in cells. Anything thinner reads as a stray line once fill
 * cells cover most of it, so blocks never go below this.
 */
const MIN_BLOCK = 4;

/** Split a span into segments that sum to `total`, each at least `MIN_BLOCK` cells. */
function splitAxis(total: number, seed: string, prefix: string): number[] {
  if (total <= 0) return [];

  const minLarge = Math.max(MIN_BLOCK, Math.floor(total * 0.14));
  if (total < minLarge * 2) return [total];

  const sizes: number[] = [];
  let remaining = total;
  let i = 0;

  while (remaining > 0) {
    if (remaining <= minLarge) {
      sizes.push(remaining);
      break;
    }

    const spread = seededUnit(seed, `${prefix}:s:${i}`);
    const maxFrac = 0.24 + spread * 0.56;
    const maxSize = Math.max(minLarge, Math.floor(remaining * maxFrac));
    let size = minLarge + Math.floor(seededUnit(seed, `${prefix}:z:${i}`) * (maxSize - minLarge + 1));

    size = Math.max(1, Math.min(size, remaining));

    if (remaining - size > 0 && remaining - size < minLarge) {
      size = remaining;
    }

    sizes.push(size);
    remaining -= size;
    i++;
  }

  return sizes;
}

/** 2–4 wide vertical columns spanning the full grid width. */
function columnWidths(gridCols: number, seed: string): number[] {
  const minCol = Math.min(gridCols, Math.max(MIN_BLOCK, Math.floor(gridCols * 0.14)));
  // Cap the count so `count * minCol` fits; otherwise the balancing loop below never ends.
  const maxCount = Math.max(1, Math.floor(gridCols / minCol));
  const count = Math.min(maxCount, 2 + Math.floor(seededUnit(seed, 'colCount') * 3));
  const weights = Array.from({ length: count }, (_, i) => 0.35 + seededUnit(seed, `colW:${i}`) * 0.65);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const raw = weights.map((w) => Math.max(minCol, Math.round((w / weightSum) * gridCols)));
  let delta = gridCols - raw.reduce((a, b) => a + b, 0);

  for (let i = 0; delta !== 0; i = (i + 1) % count) {
    if (delta > 0) {
      raw[i]! += 1;
      delta -= 1;
    } else if (raw[i]! > minCol) {
      raw[i]! -= 1;
      delta += 1;
    }
  }

  return raw;
}

function pickWeightedBlockColor(seed: string, key: string): string {
  const u = seededUnit(seed, key);
  let cumulative = 0;
  for (const entry of BLOCK_COLOR_WEIGHTS) {
    cumulative += entry.weight;
    if (u < cumulative) return entry.color;
  }
  return BLOCK_COLOR_WEIGHTS[BLOCK_COLOR_WEIGHTS.length - 1]!.color;
}

function blockColor(
  seed: string,
  colIdx: number,
  rowIdx: number,
  subIdx: number,
  phase: number,
): string {
  const stagger = seededUnit(seed, `st:${colIdx}:${rowIdx}:${subIdx}`);
  const phaseBucket = phase <= 0 ? 0 : Math.floor((phase + stagger * 3) * 1.5);
  return pickWeightedBlockColor(seed, `c:${colIdx}:${rowIdx}:${subIdx}:${phaseBucket}`);
}

/**
 * Tile the full canvas with large axis-aligned primary-color rectangles.
 */
export function generateColorBlocks(
  seed: string,
  gridCols: number,
  gridRows: number,
  phase = 0,
): ColorBlock[] {
  if (gridCols < 2 || gridRows < 2) return [];

  const colWidths = columnWidths(gridCols, seed);
  const blocks: ColorBlock[] = [];
  let col = 0;

  for (let ci = 0; ci < colWidths.length; ci++) {
    const cw = colWidths[ci]!;
    const rowHeights = splitAxis(gridRows, seed, `row:${ci}`);
    let row = 0;

    for (let ri = 0; ri < rowHeights.length; ri++) {
      const rh = rowHeights[ri]!;
      const subdivide =
        cw >= MIN_BLOCK * 2 &&
        seededUnit(seed, `split:${ci}:${ri}`) < (rh >= 10 ? 0.16 : 0.22);

      if (subdivide) {
        const subWidths = splitAxis(cw, seed, `subw:${ci}:${ri}`);
        let subCol = col;
        for (let si = 0; si < subWidths.length; si++) {
          const sw = subWidths[si]!;
          blocks.push({
            col: subCol,
            row,
            cols: sw,
            rows: rh,
            color: blockColor(seed, ci, ri, si, phase),
          });
          subCol += sw;
        }
      } else {
        blocks.push({
          col,
          row,
          cols: cw,
          rows: rh,
          color: blockColor(seed, ci, ri, 0, phase),
        });
      }

      row += rh;
    }

    col += cw;
  }

  return blocks;
}

/**
 * Every cell must sit inside a square of its own color this many cells wide.
 * Anything narrower reads as a stray line once fill cells cover it.
 */
const MIN_SHAPE_SPAN = 4;

/** Shapes smaller than this many cells are folded into their neighbors before squaring up. */
const MIN_SHAPE_AREA = 60;

/** Pull each color's noise field up by its palette weight so green and blue dominate. */
const SHAPE_WEIGHT_BIAS = 0.08;

function shapeField(noise: SimplexNoise, col: number, row: number, cols: number, rows: number, k: number): number {
  // Features span roughly a third of the canvas, warped like the pattern's flow field.
  const scale = 2.6 / Math.max(cols, rows);
  const wx = noise.fbm(col * scale * 0.7, row * scale * 0.7, 91.3, 2, 0.5) - 0.5;
  const wy = noise.fbm(col * scale * 0.7, row * scale * 0.7, 173.9, 2, 0.5) - 0.5;
  return noise.fbm((col + wx * 6 / scale) * scale, (row + wy * 6 / scale) * scale, k * 37.7, 1, 0.45);
}

/** Majority of the 8 neighbors that hold a color (≥ 0), or `null` when none do. */
function neighborMajority(grid: number[][], col: number, row: number): number | null {
  const counts = new Map<number, number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const v = grid[row + dr]?.[col + dc];
      if (v !== undefined && v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/** Clear (-1) every cell that no `span`×`span` square of its own color covers. Returns the count. */
function clearUncovered(grid: number[][], span: number): number {
  const rows = grid.length;
  const cols = grid[0]!.length;
  const covered = grid.map((r) => r.map(() => false));
  for (let row = 0; row + span <= rows; row++) {
    for (let col = 0; col + span <= cols; col++) {
      const v = grid[row]![col]!;
      let solid = true;
      for (let r = row; r < row + span && solid; r++) {
        for (let c = col; c < col + span; c++) {
          if (grid[r]![c] !== v) {
            solid = false;
            break;
          }
        }
      }
      if (!solid) continue;
      for (let r = row; r < row + span; r++) {
        for (let c = col; c < col + span; c++) covered[r]![c] = true;
      }
    }
  }
  let cleared = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!covered[row]![col]) {
        grid[row]![col] = -1;
        cleared++;
      }
    }
  }
  return cleared;
}

/**
 * Refill cleared cells a whole `span`×`span` square at a time, so every refilled cell
 * is covered by construction. Each square takes the color it already holds most of,
 * preferring squares that hold only one color so no colored cell is overwritten.
 */
function fillCleared(grid: number[][], span: number): void {
  const rows = grid.length;
  const cols = grid[0]!.length;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row]![col]! >= 0) continue;
      let best: { r0: number; c0: number; color: number; score: number } | null = null;
      for (let r0 = Math.max(0, row - span + 1); r0 <= Math.min(row, rows - span); r0++) {
        for (let c0 = Math.max(0, col - span + 1); c0 <= Math.min(col, cols - span); c0++) {
          const counts = new Map<number, number>();
          for (let r = r0; r < r0 + span; r++) {
            for (let c = c0; c < c0 + span; c++) {
              const v = grid[r]![c]!;
              if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
            }
          }
          let color = neighborMajority(grid, col, row) ?? 0;
          let top = 0;
          let colored = 0;
          for (const [v, n] of counts) {
            colored += n;
            if (n > top) {
              color = v;
              top = n;
            }
          }
          // Overwriting another color is a last resort.
          const score = top - (colored - top) * span * span;
          if (!best || score > best.score) best = { r0, c0, color, score };
        }
      }
      if (!best) continue;
      for (let r = best.r0; r < best.r0 + span; r++) {
        for (let c = best.c0; c < best.c0 + span; c++) grid[r]![c] = best.color;
      }
    }
  }
}

/** Label 4-connected same-color areas. */
function labelShapes(grid: number[][]): number[][] {
  const labels = grid.map((r) => r.map(() => -1));
  let next = 0;
  grid.forEach((r, row) =>
    r.forEach((color, col) => {
      if (labels[row]![col] !== -1) return;
      const id = next++;
      const stack = [[col, row]];
      labels[row]![col] = id;
      while (stack.length) {
        const [c, rr] = stack.pop()!;
        for (const [nc, nr] of [[c! + 1, rr!], [c! - 1, rr!], [c!, rr! + 1], [c!, rr! - 1]]) {
          if (grid[nr!]?.[nc!] !== color || labels[nr!]![nc!] !== -1) continue;
          labels[nr!]![nc!] = id;
          stack.push([nc!, nr!]);
        }
      }
    }),
  );
  return labels;
}

/** Color index per cell: warped noise blobs, smoothed, with every sliver folded away. */
function shapeColorGrid(seed: string, cols: number, rows: number): number[][] {
  const noise = new SimplexNoise(hashSeed(`${seed}:shapes`));
  const weights = BLOCK_COLOR_WEIGHTS.map((e) => e.weight);
  const maxWeight = Math.max(...weights);
  let grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      let best = 0;
      let bestScore = -Infinity;
      weights.forEach((w, k) => {
        const score = shapeField(noise, col, row, cols, rows, k) + SHAPE_WEIGHT_BIAS * (w / maxWeight);
        if (score > bestScore) {
          best = k;
          bestScore = score;
        }
      });
      return best;
    }),
  );

  // Smooth the noise so edges step like the pattern's own blobs.
  for (let pass = 0; pass < 3; pass++) {
    grid = grid.map((r, row) => r.map((v, col) => neighborMajority(grid, col, row) ?? v));
  }

  // Fold small shapes into whatever surrounds them, growing the neighbors in rings.
  const labels = labelShapes(grid);
  const sizes = new Map<number, number>();
  labels.forEach((r) => r.forEach((id) => sizes.set(id, (sizes.get(id) ?? 0) + 1)));
  const minArea = Math.min(MIN_SHAPE_AREA, Math.floor((cols * rows) / 8));
  if ([...sizes.values()].some((n) => n >= minArea)) {
    grid = grid.map((r, row) => r.map((v, col) => (sizes.get(labels[row]![col]!)! < minArea ? -1 : v)));
    for (;;) {
      const fills: [number, number, number][] = [];
      grid.forEach((r, row) =>
        r.forEach((v, col) => {
          if (v >= 0) return;
          const next = neighborMajority(grid, col, row);
          if (next !== null) fills.push([col, row, next]);
        }),
      );
      if (!fills.length) break;
      for (const [col, row, v] of fills) grid[row]![col] = v;
    }
  }

  const span = Math.min(MIN_SHAPE_SPAN, cols, rows);
  let lastCleared = -1;
  let fillSpan = span;
  for (let pass = 0; pass < 40; pass++) {
    const before = grid.map((r) => [...r]);
    const cleared = clearUncovered(grid, span);
    if (!cleared) return grid;
    // No square fits anywhere (tiny or very busy canvas): fall back to one color.
    if (cleared === cols * rows) return before.map((r) => r.map(() => before[0]![0]!));
    // Squares fighting over the same cells: refill with bigger squares until it settles.
    // At canvas size one square swallows the fight, so this always ends.
    if (cleared === lastCleared || pass >= 6) fillSpan = Math.min(fillSpan + 2, cols, rows);
    lastCleared = cleared;
    fillCleared(grid, fillSpan);
  }
  return grid;
}

/**
 * Organic color shapes on the cell grid, emitted as one-row runs tagged with their
 * shape. At phase 0 each shape keeps its noise color; animation recolors whole
 * shapes on the same staggered buckets as the rectangular blocks.
 */
export function generateColorShapes(
  seed: string,
  gridCols: number,
  gridRows: number,
  phase = 0,
): ColorBlock[] {
  if (gridCols < 2 || gridRows < 2) return [];

  const grid = shapeColorGrid(seed, gridCols, gridRows);
  const labels = labelShapes(grid);
  const shapeColor = new Map<number, string>();
  const colorFor = (shape: number, colorIdx: number, col: number, row: number): string => {
    let color = shapeColor.get(shape);
    if (color === undefined) {
      // The shape's first cell in scan order is a stable key while it animates.
      color =
        phase <= 0
          ? BLOCK_COLOR_WEIGHTS[colorIdx]!.color
          : blockColor(seed, col, row, colorIdx, phase);
      shapeColor.set(shape, color);
    }
    return color;
  };

  const runs: ColorBlock[] = [];
  for (let row = 0; row < gridRows; row++) {
    let col = 0;
    while (col < gridCols) {
      const shape = labels[row]![col]!;
      const start = col;
      while (col < gridCols && labels[row]![col] === shape) col++;
      runs.push({
        col: start,
        row,
        cols: col - start,
        rows: 1,
        color: colorFor(shape, grid[row]![start]!, start, row),
        shape,
      });
    }
  }
  return runs;
}

export function usesColorBlocks(schemeId: ColorSchemeId): boolean {
  return schemeId === 'color-blocks' || schemeId === 'color-shapes';
}

/** Layout seed for color blocks; re-click bumps `colorFieldSeed` without changing the pattern seed. */
export function colorBlocksLayoutSeed(
  schemeId: ColorSchemeId,
  patternSeed: string,
  colorFieldSeed?: string,
): string {
  if (!usesColorBlocks(schemeId)) return patternSeed;
  return colorFieldSeed ?? patternSeed;
}

export function colorBlocksForScheme(
  schemeId: ColorSchemeId,
  seed: string,
  cols: number,
  rows: number,
  phase = 0,
): ColorBlock[] | null {
  if (schemeId === 'color-shapes') return generateColorShapes(seed, cols, rows, phase);
  if (!usesColorBlocks(schemeId)) return null;
  return generateColorBlocks(seed, cols, rows, phase);
}

export function colorBlocksSwatchStyle(): string {
  const [red, green, blue, pink] = BLOCK_PALETTE;
  return [
    'linear-gradient(135deg',
    `${red} 0%`,
    `${red} 12%`,
    `${green} 12%`,
    `${green} 50%`,
    `${blue} 50%`,
    `${blue} 88%`,
    `${pink} 88%`,
    `${pink} 100%)`,
  ].join(', ');
}

export function colorShapesSwatchStyle(): string {
  const [red, green, blue, pink] = BLOCK_PALETTE;
  return [
    `radial-gradient(circle at 22% 30%, ${pink} 0 18%, transparent 19%)`,
    `radial-gradient(ellipse 60% 80% at 80% 75%, ${red} 0 30%, transparent 31%)`,
    `radial-gradient(ellipse 70% 90% at 30% 90%, ${blue} 0 45%, transparent 46%)`,
    green,
  ].join(', ');
}
