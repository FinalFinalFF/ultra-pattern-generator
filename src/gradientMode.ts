import { hashSeed, SimplexNoise } from './noise';
import { GRADIENT_DENSITY_BANDS } from './gradientMapping';
import type { GradientCellMapping, GridCell } from './types';

interface Vec2 {
  x: number;
  y: number;
}

interface MeshStop {
  x: number;
  y: number;
  value: number;
  sigma: number;
}

type CubicBezier = [Vec2, Vec2, Vec2, Vec2];

/** Equal band edges: void, then square → circle → hexagon → logo → grid. */
const GRADIENT_BAND_COUNT = GRADIENT_DENSITY_BANDS.length;
const BAND_EDGES = Array.from(
  { length: GRADIENT_BAND_COUNT },
  (_, i) => (i + 1) / (GRADIENT_BAND_COUNT + 1),
) as readonly number[];

const MAX_DENSITY_RANK = GRADIENT_BAND_COUNT;

const MESH_BLEND = 0.68;
const RIBBON_BLEND = 0.32;

function seededUnit(seed: string, key: string): number {
  return hashSeed(`${seed}:grad:${key}`) / 0xffffffff;
}

function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Seeded mesh-gradient control points with wide Gaussian influence. */
function generateMeshStops(seed: string, count = 5): MeshStop[] {
  const stops: MeshStop[] = [];
  for (let i = 0; i < count; i++) {
    stops.push({
      x: 0.06 + seededUnit(seed, `mx:${i}`) * 0.88,
      y: 0.06 + seededUnit(seed, `my:${i}`) * 0.88,
      value: seededUnit(seed, `mv:${i}`),
      sigma: 0.24 + seededUnit(seed, `ms:${i}`) * 0.16,
    });
  }
  return stops;
}

/** Soft Gaussian blend of control-point values — multi-lobe mesh gradient. */
function sampleMeshField(stops: MeshStop[], x: number, y: number): number {
  let value = 0;
  let wSum = 0;

  for (const stop of stops) {
    const dx = x - stop.x;
    const dy = y - stop.y;
    const sigma2 = stop.sigma * stop.sigma;
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma2));
    value += stop.value * w;
    wSum += w;
  }

  return wSum > 0 ? value / wSum : 0.5;
}

function bezierPoint(curve: CubicBezier, t: number): Vec2 {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return vec2(
    uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  );
}

function closestDistOnBezier(curve: CubicBezier, x: number, y: number): number {
  const samples = 64;
  let bestDistSq = Infinity;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const d2 = distSq(bezierPoint(curve, t), vec2(x, y));
    if (d2 < bestDistSq) bestDistSq = d2;
  }

  const step = 1 / samples;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (distSq(bezierPoint(curve, t), vec2(x, y)) <= bestDistSq + 1e-9) {
      lo = Math.max(0, t - step);
      hi = Math.min(1, t + step);
      break;
    }
  }

  for (let i = 0; i < 10; i++) {
    const t1 = lo + (hi - lo) / 3;
    const t2 = hi - (hi - lo) / 3;
    if (distSq(bezierPoint(curve, t1), vec2(x, y)) < distSq(bezierPoint(curve, t2), vec2(x, y))) {
      hi = t2;
    } else {
      lo = t1;
    }
  }

  return Math.sqrt(distSq(bezierPoint(curve, (lo + hi) * 0.5), vec2(x, y)));
}

function generateRibbonCurves(seed: string, count = 2): CubicBezier[] {
  const curves: CubicBezier[] = [];

  for (let i = 0; i < count; i++) {
    const edge = Math.floor(seededUnit(seed, `edge:${i}`) * 4);
    const along0 = 0.08 + seededUnit(seed, `a0:${i}`) * 0.84;
    const along3 = 0.08 + seededUnit(seed, `a3:${i}`) * 0.84;

    let p0: Vec2;
    let p3: Vec2;
    switch (edge) {
      case 0:
        p0 = vec2(0.04, along0);
        p3 = vec2(0.96, along3);
        break;
      case 1:
        p0 = vec2(along0, 0.04);
        p3 = vec2(along3, 0.96);
        break;
      case 2:
        p0 = vec2(0.04, along0);
        p3 = vec2(0.96, 1 - along3);
        break;
      default:
        p0 = vec2(along0, 0.96);
        p3 = vec2(along3, 0.04);
        break;
    }

    curves.push([
      p0,
      vec2(
        lerp(p0.x, p3.x, 0.25) + (seededUnit(seed, `b1x:${i}`) - 0.5) * 0.38,
        lerp(p0.y, p3.y, 0.25) + (seededUnit(seed, `b1y:${i}`) - 0.5) * 0.38,
      ),
      vec2(
        lerp(p0.x, p3.x, 0.65) + (seededUnit(seed, `b2x:${i}`) - 0.5) * 0.38,
        lerp(p0.y, p3.y, 0.65) + (seededUnit(seed, `b2y:${i}`) - 0.5) * 0.38,
      ),
      p3,
    ]);
  }

  return curves;
}

/** Gaussian falloff from nearest ribbon spine — curved dense bands. */
function sampleRibbonField(curves: CubicBezier[], x: number, y: number): number {
  let minDist = Infinity;
  for (const curve of curves) {
    minDist = Math.min(minDist, closestDistOnBezier(curve, x, y));
  }
  const sigma = 0.17;
  return Math.exp(-(minDist * minDist) / (2 * sigma * sigma));
}

function sampleGradientField(
  stops: MeshStop[],
  curves: CubicBezier[],
  noise: SimplexNoise,
  seed: string,
  x: number,
  y: number,
): number {
  const mesh = sampleMeshField(stops, x, y);
  const ribbon = sampleRibbonField(curves, x, y);
  const blended = mesh * MESH_BLEND + ribbon * RIBBON_BLEND;
  const warp = noise.noise3D(x * 1.6 + 0.3, y * 1.6 + 0.7, hashSeed(`${seed}:warp`) * 0.001) * 0.06;
  return smoothstep(0.04, 0.96, clamp01(blended + warp));
}

function fieldToCell(value: number, mapping: GradientCellMapping): GridCell {
  if (value < BAND_EDGES[0]) {
    return { typeId: mapping.void };
  }
  for (let i = GRADIENT_BAND_COUNT - 1; i >= 0; i--) {
    if (value >= BAND_EDGES[i]) {
      const band = GRADIENT_DENSITY_BANDS[GRADIENT_BAND_COUNT - 1 - i];
      return { typeId: mapping[band] };
    }
  }
  return { typeId: mapping.grid };
}

/** Density rank: void (0) → grid → logo → hexagon → circle → square. */
function typeIdToRank(typeId: string, mapping: GradientCellMapping): number {
  if (typeId === mapping.void) return 0;
  for (let i = 0; i < GRADIENT_BAND_COUNT; i++) {
    if (typeId === mapping[GRADIENT_DENSITY_BANDS[i]]) {
      return GRADIENT_BAND_COUNT - i;
    }
  }
  return Math.ceil(GRADIENT_BAND_COUNT / 2);
}

function rankToTypeId(rank: number, mapping: GradientCellMapping): string {
  if (rank <= 0) return mapping.void;
  if (rank > GRADIENT_BAND_COUNT) return mapping.solid;
  return mapping[GRADIENT_DENSITY_BANDS[GRADIENT_BAND_COUNT - rank]];
}

/**
 * Safety pass: adjacent cells differ by at most one density step.
 * Primary gradation comes from the smooth scalar field.
 */
export function enforceGradientLayers(
  grid: GridCell[][],
  mapping: GradientCellMapping,
  cols: number,
  rows: number,
): GridCell[][] {
  let ranks = grid.map((row) => row.map((cell) => typeIdToRank(cell.typeId, mapping)));

  for (let pass = 0; pass < cols + rows; pass++) {
    let changed = false;
    const next = ranks.map((row) => [...row]);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rank = ranks[row][col];
        let maxNeighbor = 0;
        let minNeighbor: number = MAX_DENSITY_RANK;

        if (row > 0) {
          maxNeighbor = Math.max(maxNeighbor, ranks[row - 1][col]);
          minNeighbor = Math.min(minNeighbor, ranks[row - 1][col]);
        }
        if (row + 1 < rows) {
          maxNeighbor = Math.max(maxNeighbor, ranks[row + 1][col]);
          minNeighbor = Math.min(minNeighbor, ranks[row + 1][col]);
        }
        if (col > 0) {
          maxNeighbor = Math.max(maxNeighbor, ranks[row][col - 1]);
          minNeighbor = Math.min(minNeighbor, ranks[row][col - 1]);
        }
        if (col + 1 < cols) {
          maxNeighbor = Math.max(maxNeighbor, ranks[row][col + 1]);
          minNeighbor = Math.min(minNeighbor, ranks[row][col + 1]);
        }

        if (rank > maxNeighbor + 1) {
          next[row][col] = rank - 1;
          changed = true;
        } else if (rank > 0 && rank < minNeighbor - 1) {
          next[row][col] = rank + 1;
          changed = true;
        }
      }
    }

    ranks = next;
    if (!changed) break;
  }

  return ranks.map((row, rowIdx) =>
    row.map((rank, colIdx) => ({
      ...grid[rowIdx][colIdx],
      typeId: rankToTypeId(rank, mapping),
    })),
  );
}

/** Assign cell types from a seeded mesh-gradient density field. */
export function assignGradient(
  seed: string,
  cols: number,
  rows: number,
  mapping: GradientCellMapping,
): GridCell[][] {
  const stops = generateMeshStops(seed);
  const curves = generateRibbonCurves(seed);
  const noise = new SimplexNoise(hashSeed(`${seed}:grad`));
  const grid: GridCell[][] = [];

  for (let row = 0; row < rows; row++) {
    const rowCells: GridCell[] = [];
    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const ny = (row + 0.5) / rows;
      const value = sampleGradientField(stops, curves, noise, seed, nx, ny);
      rowCells.push(fieldToCell(value, mapping));
    }
    grid.push(rowCells);
  }

  return grid;
}
