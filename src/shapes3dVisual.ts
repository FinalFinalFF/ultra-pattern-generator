import { getFillInset } from './cellTypes';
import type { CellTypeDef, ShadeBand } from './types';

/** Perceived ink density 0 (lightest) … 1 (darkest). */
const SHADE_DENSITY: Record<ShadeBand, number> = {
  highlight: 0.1,
  light: 0.32,
  mid: 0.52,
  dark: 0.74,
  deep: 1,
  silhouette: 0.92,
};

/** Tint applied beneath 3D shape cells so line-based types don't read as holes. */
export const SHAPE3D_SURFACE_FILL = '#f0f0f0';
export function applyShadeVisualScale(type: CellTypeDef, band: ShadeBand): CellTypeDef {
  const density = SHADE_DENSITY[band];
  const scaled = { ...type };

  switch (type.mode) {
    case 'circle':
    case 'hexagon':
      if (band === 'highlight') {
        scaled.circleRadius = type.circleRadius * 0.18;
      } else {
        scaled.circleRadius = type.circleRadius * (0.3 + 0.7 * density);
      }
      break;
    case 'crosshatch': {
      const tightness = band === 'light' ? 0.36 : band === 'mid' ? 0.52 : 0.4 + 0.6 * density;
      scaled.hatchSpacing = type.hatchSpacing / tightness;
      scaled.fillInset = (type.fillInset ?? 0.06) + (1 - density) * 0.1;
      break;
    }
    case 'fill':
      if (band === 'dark') {
        scaled.fillInset = getFillInset(type) + 0.1;
      } else {
        scaled.fillInset = getFillInset(type) + (1 - density) * 0.04;
      }
      break;
    case 'stroke':
    case 'mesh':
      scaled.strokeWidth = Math.max(0.5, type.strokeWidth * (0.45 + 0.55 * density));
      break;
    case 'svg':
      scaled.circleRadius = type.circleRadius * (0.65 + 0.35 * density);
      break;
    default:
      break;
  }

  return scaled;
}

export function shadeDensity(band: ShadeBand): number {
  return SHADE_DENSITY[band];
}
