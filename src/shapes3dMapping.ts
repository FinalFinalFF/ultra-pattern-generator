import type { CellTypeDef, Shapes3dCellMapping, ShadeBand } from './types';
import { LEGACY_SHADE_TYPE_IDS, TYPE_IDS } from './types';

/** Background only — never assigned to lit/shaded surface bands. */
export const SHAPE3D_BACKGROUND_TYPE = TYPE_IDS.outline;

const SURFACE_BANDS = [
  'highlight',
  'light',
  'mid',
  'dark',
  'deep',
  'silhouette',
] as const satisfies readonly ShadeBand[];

/** Dots at highlight; crosshatch mid-tones; solid squares in shadow. */
export const defaultShape3dMapping: Shapes3dCellMapping = {
  highlight: TYPE_IDS.dot,
  light: TYPE_IDS.crosshatch,
  mid: TYPE_IDS.crosshatch,
  dark: TYPE_IDS.solid,
  deep: TYPE_IDS.solid,
  silhouette: TYPE_IDS.logo,
  void: SHAPE3D_BACKGROUND_TYPE,
};

/** Outline and grid read as background mesh; keep them off the shape surface. */
const BACKGROUND_LIKE_TYPES = new Set<string>([TYPE_IDS.outline, TYPE_IDS.grid]);

function fallbackSurfaceType(band: ShadeBand): string {
  switch (band) {
    case 'highlight':
      return TYPE_IDS.dot;
    case 'light':
    case 'mid':
      return TYPE_IDS.crosshatch;
    case 'dark':
    case 'deep':
      return TYPE_IDS.solid;
    case 'silhouette':
      return TYPE_IDS.logo;
  }
}

function sanitizeSurfaceType(typeId: string, band: ShadeBand): string {
  if (!BACKGROUND_LIKE_TYPES.has(typeId)) return typeId;
  return fallbackSurfaceType(band);
}

export function resolveShape3dMapping(cellTypes: CellTypeDef[]): Shapes3dCellMapping {
  const ids = new Set(cellTypes.map((t) => t.id));
  const normalized = {} as Shapes3dCellMapping;

  for (const key of Object.keys(defaultShape3dMapping) as (keyof Shapes3dCellMapping)[]) {
    const value = defaultShape3dMapping[key];
    const resolved = ids.has(value) ? value : defaultShape3dMapping[key];
    normalized[key] =
      key === 'void' ? resolved : sanitizeSurfaceType(resolved, key as ShadeBand);
  }

  for (const band of SURFACE_BANDS) {
    normalized[band] = sanitizeSurfaceType(normalized[band], band);
  }

  return normalized;
}

export function isLegacyShadeTypeId(id: string): boolean {
  return (LEGACY_SHADE_TYPE_IDS as readonly string[]).includes(id);
}

export function filterPatternCellTypes(cellTypes: CellTypeDef[]): CellTypeDef[] {
  return cellTypes.filter((t) => !isLegacyShadeTypeId(t.id));
}
