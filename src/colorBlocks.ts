import { hashSeed } from './noise';
import { BLOCK_COLOR_WEIGHTS, BLOCK_PALETTE } from './brandColors';
import type { ColorBlock, ColorSchemeId } from './types';

function seededUnit(seed: string, key: string): number {
  return hashSeed(`${seed}:blocks:${key}`) / 0xffffffff;
}

/**
 * Split a span into segments that sum to `total`. Most segments are large;
 * thin slivers appear occasionally for rhythm.
 */
function splitAxis(
  total: number,
  seed: string,
  prefix: string,
  thinChance: number,
): number[] {
  if (total <= 0) return [];
  if (total <= 2) return [total];

  const minLarge = Math.max(2, Math.floor(total * 0.14));
  const sizes: number[] = [];
  let remaining = total;
  let i = 0;

  while (remaining > 0) {
    if (remaining <= minLarge) {
      sizes.push(remaining);
      break;
    }

    const u = seededUnit(seed, `${prefix}:${i}`);
    let size: number;

    if (u < thinChance) {
      const maxThin = Math.min(3, remaining - minLarge);
      size = maxThin > 0 ? 1 + Math.floor(seededUnit(seed, `${prefix}:t:${i}`) * maxThin) : minLarge;
    } else {
      const spread = seededUnit(seed, `${prefix}:s:${i}`);
      const maxFrac = 0.24 + spread * 0.56;
      const maxSize = Math.max(minLarge, Math.floor(remaining * maxFrac));
      size = minLarge + Math.floor(seededUnit(seed, `${prefix}:z:${i}`) * (maxSize - minLarge + 1));
    }

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
  const count = 2 + Math.floor(seededUnit(seed, 'colCount') * 3);
  const minCol = Math.max(4, Math.floor(gridCols * 0.14));
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
    const rowHeights = splitAxis(gridRows, seed, `row:${ci}`, 0.07);
    let row = 0;

    for (let ri = 0; ri < rowHeights.length; ri++) {
      const rh = rowHeights[ri]!;
      const subdivide =
        cw >= 5 &&
        rh >= 3 &&
        seededUnit(seed, `split:${ci}:${ri}`) < (rh >= 10 ? 0.16 : 0.22);

      if (subdivide) {
        const subWidths = splitAxis(cw, seed, `subw:${ci}:${ri}`, 0.08);
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

export function usesColorBlocks(schemeId: ColorSchemeId): boolean {
  return schemeId === 'color-blocks';
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
