import { getNoiseAssignableTypes } from './cellTypes';
import { flowOffset } from './flowField';
import { sampleNoiseAdvected, SimplexNoise } from './noise';
import type { AnimationParams, CellTypeDef, NoiseParams, WeightedItem } from './types';
import { TYPE_IDS } from './types';

/** Static spatial offset per type — defines blob territories */
function typeNoiseOffset(item: WeightedItem, index: number): number {
  let h = 0;
  for (let i = 0; i < item.id.length; i++) {
    h = (h * 31 + item.id.charCodeAt(i)) >>> 0;
  }
  return (h % 997) + index * 127.1;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Regional clustering vs unified wave — lower = more mixed compositions */
const REGIONAL_WEIGHT = 0.92;
const WAVE_WEIGHT = 1 - REGIONAL_WEIGHT;

/** Low-frequency void field — white-space blobs; amount controlled by void type density. */
const VOID_SCALE_MULT = 0.36;

/** Target combined void-zone share (empty core + grid fringe) from density slider. */
function targetVoidZoneFraction(voidDensity: number): number {
  // ~19% at default density 0.22
  return Math.min(0.38, Math.max(0.08, voidDensity * 0.88));
}

/** Share of void zone assigned to pure empty vs textured grid fringe. */
const VOID_EMPTY_SHARE = 0.35;
const VOID_GRID_FRINGE_SHARE = 0.65;

/** Hexagon only in mid-density transition band (regional score quantiles). */
const HEX_DENSITY_MIN = 0.35;
const HEX_DENSITY_MAX = 0.65;

function voidScore(
  noise: SimplexNoise,
  col: number,
  row: number,
  phase: number,
  params: NoiseParams,
): number {
  const warp = flowOffset(noise, col, row, phase, params);
  const low = sampleNoiseAdvected(
    noise,
    col,
    row,
    phase,
    {
      scale: params.scale * VOID_SCALE_MULT,
      octaves: 1,
      persistence: 0.35,
    },
    7331,
    warp,
  );
  const edge = sampleNoiseAdvected(
    noise,
    col,
    row,
    phase * 0.45,
    {
      scale: params.scale * 1.35,
      octaves: 2,
      persistence: 0.4,
    },
    7332,
    warp,
  );
  return smoothstep(low * 0.82 + edge * 0.18);
}

function percentileThreshold(sortedAsc: number[], fraction: number): number {
  if (sortedAsc.length === 0) return 1;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((1 - fraction) * sortedAsc.length),
  );
  return sortedAsc[idx];
}

function adaptiveVoidThresholds(
  scores: number[],
  voidDensity: number,
): { emptyCutoff: number; gridCutoff: number } {
  if (scores.length === 0) return { emptyCutoff: Infinity, gridCutoff: Infinity };

  const total = targetVoidZoneFraction(voidDensity);
  const emptyTarget = total * VOID_EMPTY_SHARE;
  const gridTarget = total * VOID_GRID_FRINGE_SHARE;
  const sorted = [...scores].sort((a, b) => a - b);

  return {
    emptyCutoff: percentileThreshold(sorted, emptyTarget),
    gridCutoff: percentileThreshold(sorted, emptyTarget + gridTarget),
  };
}

function regionalDensityScore(
  noise: SimplexNoise,
  col: number,
  row: number,
  phase: number,
  params: NoiseParams,
): number {
  const warp = flowOffset(noise, col, row, phase, params);
  return sampleNoiseAdvected(noise, col, row, phase, params, 0, warp);
}

function hexDensityBand(densityScores: number[]): { min: number; max: number } {
  if (densityScores.length === 0) return { min: 0, max: 1 };
  const sorted = [...densityScores].sort((a, b) => a - b);
  const minIdx = Math.floor(sorted.length * HEX_DENSITY_MIN);
  const maxIdx = Math.min(sorted.length - 1, Math.floor(sorted.length * HEX_DENSITY_MAX));
  return { min: sorted[minIdx], max: sorted[maxIdx] };
}

function gateHexagonType(typeId: string, density: number, band: { min: number; max: number }): string {
  if (typeId !== TYPE_IDS.hexagon) return typeId;
  if (density >= band.min && density <= band.max) return typeId;
  return density > band.max ? TYPE_IDS.dot : TYPE_IDS.grid;
}

/**
 * Winner-take-all shape classification with unified animation.
 * Regional bias and wave share the same advected flow field and phase.
 */
function classifyDominantShape(
  noise: SimplexNoise,
  col: number,
  row: number,
  phase: number,
  params: NoiseParams,
  types: WeightedItem[],
): string {
  const enabled = types.filter((t) => t.enabled && t.density > 0);
  if (enabled.length === 0) return TYPE_IDS.grid;

  const warp = flowOffset(noise, col, row, phase, params);
  const wave = sampleNoiseAdvected(noise, col, row, phase, params, 0, warp);

  let bestId = enabled[0].id;
  let bestScore = -Infinity;

  for (let i = 0; i < enabled.length; i++) {
    const item = enabled[i];
    const offset = typeNoiseOffset(item, i);
    const regional = sampleNoiseAdvected(noise, col, row, phase, params, offset, warp);
    const score =
      regional * REGIONAL_WEIGHT +
      wave * WAVE_WEIGHT +
      Math.log(item.density) * 0.14;
    if (score > bestScore) {
      bestScore = score;
      bestId = item.id;
    }
  }

  return bestId;
}

export function assignShapeTypesNoise(
  noise: SimplexNoise,
  cols: number,
  rows: number,
  phase: number,
  shapeNoise: NoiseParams,
  cellTypes: CellTypeDef[],
  _animation: AnimationParams,
): string[][] {
  const noiseTypes = getNoiseAssignableTypes(cellTypes);
  const voidType = cellTypes.find((t) => t.id === TYPE_IDS.empty);
  const voidEnabled = !!voidType?.enabled;
  const voidDensity = voidEnabled ? Math.min(1, Math.max(0, voidType?.density ?? 0)) : 0;
  const typeGrid: string[][] = [];

  const voidScores: number[][] = [];
  if (voidDensity > 0) {
    for (let row = 0; row < rows; row++) {
      const scoreRow: number[] = [];
      for (let col = 0; col < cols; col++) {
        scoreRow.push(voidScore(noise, col, row, phase, shapeNoise));
      }
      voidScores.push(scoreRow);
    }
  }

  const { emptyCutoff, gridCutoff } =
    voidDensity > 0
      ? adaptiveVoidThresholds(voidScores.flat(), voidDensity)
      : { emptyCutoff: Infinity, gridCutoff: Infinity };

  const bulkDensityScores: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const score = voidDensity > 0 ? voidScores[row][col] : 0;
      if (score > gridCutoff) continue;
      bulkDensityScores.push(regionalDensityScore(noise, col, row, phase, shapeNoise));
    }
  }
  const hexBand = hexDensityBand(bulkDensityScores);

  for (let row = 0; row < rows; row++) {
    const rowTypes: string[] = [];
    for (let col = 0; col < cols; col++) {
      const vScore = voidDensity > 0 ? voidScores[row][col] : 0;
      if (voidDensity > 0 && vScore > emptyCutoff) {
        rowTypes.push(TYPE_IDS.empty);
      } else if (voidDensity > 0 && vScore > gridCutoff) {
        rowTypes.push(TYPE_IDS.grid);
      } else {
        const primary = classifyDominantShape(
          noise,
          col,
          row,
          phase,
          shapeNoise,
          noiseTypes,
        );
        const density = regionalDensityScore(noise, col, row, phase, shapeNoise);
        rowTypes.push(gateHexagonType(primary, density, hexBand));
      }
    }
    typeGrid.push(rowTypes);
  }

  return typeGrid;
}

/** @deprecated alias */
export const assignShapeTypes = assignShapeTypesNoise;
