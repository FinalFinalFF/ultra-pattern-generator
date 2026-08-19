import type { CellTypeDef, GradientCellMapping } from './types';
import { TYPE_IDS } from './types';

/**
 * Gradient density ladder (dense center → sparse edge):
 * Square (solid) → Circle (dot) → Hexagon → Logo → Grid → Void.
 */
export const GRADIENT_DENSITY_BANDS = ['solid', 'dot', 'hexagon', 'ultra', 'grid'] as const;
export type GradientDensityBand = (typeof GRADIENT_DENSITY_BANDS)[number];

export const defaultGradientMapping: GradientCellMapping = {
  solid: TYPE_IDS.solid,
  hexagon: TYPE_IDS.hexagon,
  dot: TYPE_IDS.dot,
  ultra: TYPE_IDS.logo,
  grid: TYPE_IDS.grid,
  void: TYPE_IDS.empty,
};

const BAND_FALLBACK: Record<GradientDensityBand, string> = {
  solid: TYPE_IDS.solid,
  hexagon: TYPE_IDS.hexagon,
  dot: TYPE_IDS.dot,
  ultra: TYPE_IDS.logo,
  grid: TYPE_IDS.grid,
};

function resolveBandType(
  ids: Set<string>,
  enabled: Set<string>,
  band: GradientDensityBand,
  preferred: string,
): string {
  if (ids.has(preferred) && enabled.has(preferred)) return preferred;
  const fallback = BAND_FALLBACK[band];
  if (ids.has(fallback) && enabled.has(fallback)) return fallback;
  if (band === 'ultra' && enabled.has(TYPE_IDS.dot)) return TYPE_IDS.dot;
  if (band === 'hexagon' && enabled.has(TYPE_IDS.dot)) return TYPE_IDS.dot;
  if (enabled.has(TYPE_IDS.grid)) return TYPE_IDS.grid;
  return TYPE_IDS.solid;
}

export function resolveGradientMapping(cellTypes: CellTypeDef[]): GradientCellMapping {
  const ids = new Set(cellTypes.map((t) => t.id));
  const enabled = new Set(cellTypes.filter((t) => t.enabled).map((t) => t.id));

  const mapping = {} as GradientCellMapping;
  for (const band of GRADIENT_DENSITY_BANDS) {
    mapping[band] = resolveBandType(ids, enabled, band, defaultGradientMapping[band]);
  }
  mapping.void = ids.has(TYPE_IDS.empty) ? TYPE_IDS.empty : TYPE_IDS.grid;
  return mapping;
}
