import type { CellTypeDef, GridCell, WeightedItem } from './types';
import { TYPE_IDS } from './types';
import { LOGO_SVG_MARKUP, LOGO_SVG_VIEWBOX, LOGO_SYMBOL_ID } from './logoCell';

/** Types assigned by noise (densities normalized together). */
export const NOISE_BULK_IDS = new Set<string>([
  TYPE_IDS.grid,
  TYPE_IDS.dot,
  TYPE_IDS.hexagon,
  TYPE_IDS.solid,
]);

/** Types placed in border zones; density is independent (0–1). */
export const BORDER_ZONE_IDS = new Set<string>([
  TYPE_IDS.logo,
  TYPE_IDS.crosshatch,
  TYPE_IDS.outline,
]);

export function isNoiseBulkType(id: string): boolean {
  return NOISE_BULK_IDS.has(id);
}

export function isBorderZoneType(id: string): boolean {
  return BORDER_ZONE_IDS.has(id);
}

export function hasEditableDensity(_type: CellTypeDef): boolean {
  return true;
}

export function getTypeDensity(typeMap: Map<string, CellTypeDef>, id: string): number {
  const d = typeMap.get(id)?.density ?? 0;
  return Math.min(1, Math.max(0, d));
}

/** Merge render defaults from built-ins; preserve user density and enabled flags. */
export function mergeCellTypeDefaults(types: CellTypeDef[]): CellTypeDef[] {
  const defaultById = new Map(getDefaultCellTypes().map((d) => [d.id, d]));

  return types.map((t) => {
    const def = defaultById.get(t.id);
    if (!def) return t;

    const merged = { ...def, ...t, density: t.density ?? def.density };
    if (t.id === TYPE_IDS.logo) {
      merged.svgSymbolId = t.svgSymbolId ?? def.svgSymbolId;
      merged.svgMarkup = t.svgMarkup ?? def.svgMarkup;
      merged.svgViewBox = t.svgViewBox ?? def.svgViewBox;
    }
    return merged;
  });
}

/** @deprecated Use mergeCellTypeDefaults */
export const patchAccentCellTypes = mergeCellTypeDefaults;

export function createId(): string {
  return crypto.randomUUID();
}

export function getDefaultCellTypes(): CellTypeDef[] {
  return [
    {
      id: TYPE_IDS.grid,
      name: 'Grid',
      enabled: true,
      order: 0,
      density: 0.30,
      mode: 'mesh',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.46,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.dot,
      name: 'Dot',
      enabled: true,
      order: 1,
      density: 0.28,
      mode: 'circle',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'both',
      circleRadius: 0.48,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.hexagon,
      name: 'Hexagon',
      enabled: true,
      order: 2,
      density: 0.10,
      mode: 'hexagon',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'both',
      circleRadius: 0.46,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.solid,
      name: 'Solid',
      enabled: true,
      order: 3,
      density: 0.32,
      mode: 'fill',
      fill: '#181818',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'fill',
      circleRadius: 0.46,
      fillInset: 0.04,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.logo,
      name: 'Ultra Star',
      enabled: true,
      order: 4,
      density: 0.85,
      mode: 'svg',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.92,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
      svgSymbolId: LOGO_SYMBOL_ID,
      svgMarkup: LOGO_SVG_MARKUP,
      svgViewBox: LOGO_SVG_VIEWBOX,
    },
    {
      id: TYPE_IDS.outline,
      name: 'Outline',
      enabled: false,
      order: 5,
      density: 0.85,
      borderDepth: 1,
      mode: 'stroke',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.78,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
    {
      id: TYPE_IDS.crosshatch,
      name: 'Crosshatch',
      enabled: false,
      order: 6,
      density: 0.9,
      borderDepth: 2,
      mode: 'crosshatch',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.46,
      fillInset: 0.06,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
    {
      id: TYPE_IDS.empty,
      name: 'Void',
      enabled: true,
      order: 7,
      density: 0.22,
      mode: 'none',
      fill: '#FFFFFF',
      stroke: '#181818',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.46,
      fillInset: 0,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
  ];
}

/** Render scale for SVG cell types (fraction of cell size, centered). */
export function getSvgScale(type: CellTypeDef): number {
  const scale = type.circleRadius ?? 0.46;
  return Math.min(Math.max(scale, 0.15), 1);
}

/** Chain logos along long boundaries render smaller so they don't read as solid blobs. */
export function getLogoSvgScale(type: CellTypeDef, muted = false): number {
  const base = getSvgScale(type);
  return muted ? base * 0.42 : base;
}

export function getNoiseAssignableTypes(types: CellTypeDef[]): CellTypeDef[] {
  return types.filter((t) => t.enabled && isNoiseBulkType(t.id) && t.density > 0);
}

export function createDefaultCellType(order: number): CellTypeDef {
  return {
    id: createId(),
    name: 'New Type',
    enabled: true,
    order,
    density: 0.1,
    mode: 'fill',
      fill: '#181818',
      stroke: '#181818',
    strokeWidth: 1,
    colorApplication: 'fill',
    circleRadius: 0.46,
    fillInset: 0.04,
    hatchSpacing: 4,
    hatchAngle: 45,
    noiseAssigned: true,
  };
}

export function normalizeBulkDensities<T extends WeightedItem>(items: T[]): T[] {
  const bulk = items.filter((i) => isNoiseBulkType(i.id) && i.enabled);
  const total = bulk.reduce((s, i) => s + i.density, 0);
  if (total <= 0) return items;
  return items.map((item) =>
    isNoiseBulkType(item.id) && item.enabled
      ? { ...item, density: item.density / total }
      : item,
  );
}

/** @deprecated Use normalizeBulkDensities */
export const normalizeBulkWeights = normalizeBulkDensities;

/** @deprecated Use normalizeBulkDensities */
export function normalizeWeights<T extends WeightedItem>(items: T[]): T[] {
  return normalizeBulkDensities(items);
}

export function redistributeDensities<T extends WeightedItem>(
  items: T[],
  removedId: string,
): T[] {
  if (!isNoiseBulkType(removedId)) {
    return items.filter((i) => i.id !== removedId);
  }

  const remaining = items.filter(
    (i) => i.id !== removedId && i.enabled && isNoiseBulkType(i.id),
  );
  if (remaining.length === 0) return items.filter((i) => i.id !== removedId);
  const removedDensity = items.find((i) => i.id === removedId)?.density ?? 0;
  const share = removedDensity / remaining.length;
  return normalizeBulkDensities(
    items
      .filter((i) => i.id !== removedId)
      .map((item) =>
        isNoiseBulkType(item.id) && item.enabled
          ? { ...item, density: item.density + share }
          : item,
      ),
  );
}

/** @deprecated Use redistributeDensities */
export const redistributeWeights = redistributeDensities;

export function densitiesToThresholds(items: WeightedItem[]): { id: string; threshold: number }[] {
  const sorted = [...items]
    .filter((i) => i.enabled && i.density > 0)
    .sort((a, b) => a.order - b.order);
  let cumulative = 0;
  return sorted.map((item) => {
    cumulative += item.density;
    return { id: item.id, threshold: cumulative };
  });
}

/** @deprecated Use densitiesToThresholds */
export const weightsToThresholds = densitiesToThresholds;

export function classifyNoise(value: number, items: WeightedItem[]): string {
  const thresholds = densitiesToThresholds(items);
  if (thresholds.length === 0) return items[0]?.id ?? TYPE_IDS.grid;
  for (const t of thresholds) {
    if (value < t.threshold) return t.id;
  }
  return thresholds[thresholds.length - 1].id;
}

export function isMeshMode(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'mesh';
}

export function isVoidCell(type: CellTypeDef | undefined): boolean {
  return type?.id === TYPE_IDS.empty;
}

/** True when this cell is void (empty type). */
export function isVoidCellAt(
  grid: GridCell[][],
  typeMap: Map<string, CellTypeDef>,
  col: number,
  row: number,
): boolean {
  if (row < 0 || col < 0 || row >= grid.length || col >= (grid[0]?.length ?? 0)) {
    return false;
  }
  return isVoidCell(typeMap.get(grid[row][col].typeId));
}

/** @deprecated Use isVoidCellAt — skips mesh only on void cells, not neighbors. */
export function isVoidAdjacent(
  grid: GridCell[][],
  typeMap: Map<string, CellTypeDef>,
  col: number,
  row: number,
  _cols: number,
  _rows: number,
): boolean {
  return isVoidCellAt(grid, typeMap, col, row);
}

/** True for mesh render mode (grid lines). */
export function isMeshLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'mesh';
}

/** Mesh lines plus outline/stroke cells — shared edges, inset from other types. */
export function isGridLineCell(type: CellTypeDef | undefined): boolean {
  if (!type) return false;
  return type.mode === 'mesh' || type.mode === 'stroke';
}

/** True only for the pure grid mesh cell type. */
export function isGridCell(type: CellTypeDef | undefined): boolean {
  return type?.id === TYPE_IDS.grid;
}

/**
 * Any cell that should not extend grid lines through its boundary (circles, solids, logo, etc.).
 */
export function isMeshGutterNeighbor(type: CellTypeDef | undefined): boolean {
  if (!type || isGridLineCell(type)) return false;
  return true;
}

export function isSolidLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'fill';
}

export function isCircleLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'circle';
}

export function isHexagonLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'hexagon';
}

/** Per-side inset for fill cells (fraction of cell size). Default 4% for fill mode. */
export function getFillInset(type: CellTypeDef): number {
  if (type.mode !== 'fill') return 0;
  return type.fillInset ?? 0.04;
}

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function reindexOrders<T extends { order: number }>(items: T[]): T[] {
  return sortByOrder(items).map((item, i) => ({ ...item, order: i }));
}

export function needsCellTypeMigration(types: CellTypeDef[]): boolean {
  return (
    !types.some((t) => t.id === TYPE_IDS.logo) ||
    !types.some((t) => t.id === TYPE_IDS.empty)
  );
}
