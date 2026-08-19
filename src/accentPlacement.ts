import { hashSeed } from './noise';
import { getTypeDensity } from './cellTypes';
import type { CellTypeDef, GridCell } from './types';
import { TYPE_IDS } from './types';

type TypeMap = Map<string, CellTypeDef>;
type FoundationGroup = 'solid' | 'dot' | 'hex' | 'grid' | 'void';

const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function accentHash(seed: string, key: string): number {
  return hashSeed(`${seed}:accent:${key}`) / 0xffffffff;
}

/** Logo presence changes slowly so governance borders stay stable while drifting. */
const LOGO_PHASE_QUANT = 2;

function accentRoll(seed: string, key: string, density: number, phaseBucket = 0): boolean {
  if (density >= 0.995) return true;
  if (density <= 0) return false;
  const bucketKey = phaseBucket > 0 ? `${phaseBucket}:${key}` : key;
  return accentHash(seed, bucketKey) < density;
}

function isAccentEnabled(typeMap: TypeMap, id: string): boolean {
  return !!typeMap.get(id)?.enabled;
}

/** Canonical region for boundary distance — accents never define their own borders. */
function foundationGroup(typeId: string): FoundationGroup | null {
  if (typeId === TYPE_IDS.empty) return 'void';
  if (typeId === TYPE_IDS.solid) return 'solid';
  if (typeId === TYPE_IDS.dot) return 'dot';
  if (typeId === TYPE_IDS.hexagon) return 'hex';
  if (typeId === TYPE_IDS.grid) return 'grid';
  return null;
}

function touchesGridOrVoid(g1: FoundationGroup, g2: FoundationGroup): boolean {
  return g1 === 'grid' || g1 === 'void' || g2 === 'grid' || g2 === 'void';
}

function hasMassLightBorder(
  foundations: string[][],
  col: number,
  row: number,
  cols: number,
  rows: number,
): boolean {
  const g = foundationGroup(foundations[row][col]);
  if (!g) return false;

  for (const [dc, dr] of CARDINAL) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    const ng = foundationGroup(foundations[nr][nc]);
    if (!ng || ng === g) continue;
    if (touchesGridOrVoid(g, ng)) return true;
  }
  return false;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Steps from the nearest cell whose foundation group differs (0 = on a region border).
 * Interior grid cells keep a large distance and stay grid.
 */
function computeBoundaryDistance(
  foundations: string[][],
  cols: number,
  rows: number,
): number[][] {
  const dist = Array.from({ length: rows }, () => Array<number>(cols).fill(Infinity));
  const queue: { col: number; row: number }[] = [];
  const groupAt = (c: number, r: number) => foundationGroup(foundations[r][c]);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const g = groupAt(col, row);
      if (!g) continue;

      for (const [dc, dr] of CARDINAL) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ng = groupAt(nc, nr);
        if (ng && ng !== g) {
          dist[row][col] = 0;
          queue.push({ col, row });
          break;
        }
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const { col, row } = queue[head++]!;
    const g = groupAt(col, row)!;
    const next = dist[row][col] + 1;

    for (const [dc, dr] of CARDINAL) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (groupAt(nc, nr) !== g) continue;
      if (dist[nr][nc] <= next) continue;
      dist[nr][nc] = next;
      queue.push({ col: nc, row: nr });
    }
  }

  return dist;
}

/** One logo cell per direct foundation edge (prefer grid side on mass|grid contacts). */
function buildLogoBorderSet(
  foundations: string[][],
  dist: number[][],
  cols: number,
  rows: number,
  seed: string,
  density: number,
  phase: number,
): Set<string> {
  const logoPhaseBucket = phase > 0 ? Math.floor(phase * LOGO_PHASE_QUANT) : 0;
  const logos = new Set<string>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (dist[row][col] !== 0) continue;
      if (!hasMassLightBorder(foundations, col, row, cols, rows)) continue;
      if (!accentRoll(seed, `logo:border:${col}:${row}`, density, logoPhaseBucket)) continue;
      logos.add(cellKey(col, row));
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      for (const [dc, dr] of CARDINAL) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (nc < col || (nc === col && nr <= row)) continue;

        const g1 = foundationGroup(foundations[row][col]);
        const g2 = foundationGroup(foundations[nr][nc]);
        if (!g1 || !g2 || g1 === g2) continue;

        const k1 = cellKey(col, row);
        const k2 = cellKey(nc, nr);
        if (!logos.has(k1) || !logos.has(k2)) continue;

        const massGrid =
          (g1 === 'grid') !== (g2 === 'grid') &&
          (g1 === 'solid' ||
            g1 === 'dot' ||
            g1 === 'hex' ||
            g2 === 'solid' ||
            g2 === 'dot' ||
            g2 === 'hex');

        if (massGrid) {
          if (g1 === 'grid') logos.delete(k2);
          else if (g2 === 'grid') logos.delete(k1);
          else if (accentHash(seed, `logo:edge:${k1}|${k2}`) < 0.5) logos.delete(k1);
          else logos.delete(k2);
        } else if (accentHash(seed, `logo:edge:${k1}|${k2}`) < 0.5) {
          logos.delete(k1);
        } else {
          logos.delete(k2);
        }
      }
    }
  }

  return logos;
}

/**
 * Unified border placement: snapshot region types, then each cell gets at most one
 * display type based on distance from a region boundary. Logo / crosshatch / outline
 * density comes from each type's density in the cell type list.
 *
 * Zone 0 (border): logo
 * Zone 1..crosshatchDepth: crosshatch
 * Zone crosshatchDepth+1 .. +outlineDepth: outline
 * Everything else: original region type
 */
export function applyAccentPlacement(
  grid: GridCell[][],
  cellTypes: CellTypeDef[],
  cols: number,
  rows: number,
  seed: string,
  phase = 0,
): GridCell[][] {
  const typeMap: TypeMap = new Map(cellTypes.map((t) => [t.id, t]));
  const result = grid.map((row) => row.map((c) => ({ ...c })));

  const foundations = result.map((row) => row.map((c) => c.typeId));
  const dist = computeBoundaryDistance(foundations, cols, rows);

  const logoEnabled = isAccentEnabled(typeMap, TYPE_IDS.logo);
  const crosshatchEnabled = isAccentEnabled(typeMap, TYPE_IDS.crosshatch);
  const outlineEnabled = isAccentEnabled(typeMap, TYPE_IDS.outline);

  const logoDensity = getTypeDensity(typeMap, TYPE_IDS.logo);
  const crosshatchDensity = getTypeDensity(typeMap, TYPE_IDS.crosshatch);
  const outlineDensity = getTypeDensity(typeMap, TYPE_IDS.outline);

  const crosshatchDepth = Math.max(
    1,
    Math.round(typeMap.get(TYPE_IDS.crosshatch)?.borderDepth ?? 2),
  );
  const outlineDepth = Math.max(
    0,
    Math.round(typeMap.get(TYPE_IDS.outline)?.borderDepth ?? 1),
  );

  const logoBorder = logoEnabled
    ? buildLogoBorderSet(foundations, dist, cols, rows, seed, logoDensity, phase)
    : new Set<string>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const base = foundations[row][col];
      const d = dist[row][col];
      const key = cellKey(col, row);

      if (logoBorder.has(key)) {
        result[row][col].typeId = TYPE_IDS.logo;
        result[row][col].logoMuted = false;
        continue;
      }

      if (crosshatchEnabled && d >= 1 && d <= crosshatchDepth) {
        if (accentRoll(seed, `crosshatch:zone:${col}:${row}`, crosshatchDensity)) {
          result[row][col].typeId = TYPE_IDS.crosshatch;
          continue;
        }
      }

      if (
        outlineEnabled &&
        outlineDepth > 0 &&
        d > crosshatchDepth &&
        d <= crosshatchDepth + outlineDepth
      ) {
        if (accentRoll(seed, `outline:zone:${col}:${row}`, outlineDensity)) {
          result[row][col].typeId = TYPE_IDS.outline;
          continue;
        }
      }

      result[row][col].typeId = base;
      result[row][col].logoMuted = undefined;
    }
  }

  return result;
}

/** @deprecated Tests and tooling — returns logo sites from unified border pass. */
export function findGovernanceLogoCells(
  grid: GridCell[][],
  cols: number,
  rows: number,
  seed: string,
  logoDensity = 1,
): { col: number; row: number; massNeighborKeys: Set<string> }[] {
  const foundations = grid.map((row) => row.map((c) => c.typeId));
  const dist = computeBoundaryDistance(foundations, cols, rows);
  const keys = buildLogoBorderSet(foundations, dist, cols, rows, seed, logoDensity, 0);

  return [...keys].map((key) => {
    const [col, row] = key.split(',').map(Number);
    const neighbors = new Set<string>();
    for (const [dc, dr] of CARDINAL) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ng = foundationGroup(foundations[nr][nc]);
      const g = foundationGroup(foundations[row][col]);
      if (ng && g && ng !== g) neighbors.add(cellKey(nc, nr));
    }
    return { col, row, massNeighborKeys: neighbors };
  });
}
