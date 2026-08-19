import type { AppState, CellTypeDef, ColorSchemeId, Shape3dParams } from './types';
import { TYPE_IDS } from './types';
import {
  getDefaultCellTypes,
  needsCellTypeMigration,
  mergeCellTypeDefaults,
  normalizeBulkDensities,
} from './cellTypes';

import {
  applyColorScheme,
  colorFieldSeedForState,
  isColorSchemeId,
} from './colorSchemes';
import {
  filterPatternCellTypes,
} from './shapes3dMapping';
import { defaultShape3dForKind } from './shapes3d';
import {
  LOOP_BASE_SECONDS,
  baseRateForLoopLength,
  nearestLoopLengthPreset,
} from './animation';

const STORAGE_KEY = 'gridPatternState';
const STATE_VERSION = 62;

const REMOVED_COLOR_SCHEME_MAP: Record<string, ColorSchemeId> = {
  'color-field': 'random',
  'region-ramp': 'mono',
  gradient: 'mono',
  'white-on-black': 'mono',
  'green-dark-on-light': 'green-light-on-dark',
  'blue-dark-on-light': 'blue-light-on-dark',
  'red-dark-on-light': 'red-light-on-dark',
  'pink-dark-on-light': 'pink-light-on-dark',
};

export const defaultShape3d: Shape3dParams = defaultShape3dForKind('sphere');

const SHAPE3D_KINDS = [
  'sphere',
  'box',
  'torus',
  'ring',
  'ringArc',
  'disc',
  'capsule',
  'cone',
  'cylinder',
] as const satisfies readonly Shape3dParams['kind'][];

function normalizeShape3dKind(kind: string | undefined): Shape3dParams['kind'] {
  if (kind && (SHAPE3D_KINDS as readonly string[]).includes(kind)) {
    return kind as Shape3dParams['kind'];
  }
  return defaultShape3d.kind;
}

export const defaultShapeNoise = {
  scale: 0.019,
  octaves: 1,
  persistence: 0.3,
} as const;

export const defaultState: AppState = {
  seed: 'pattern-2024',
  cols: 60,
  rows: 34,
  cellSize: 16,
  generateMode: 'pattern',
  colorSchemeId: 'mono',
  shapeNoise: { ...defaultShapeNoise },
  shape3d: { ...defaultShape3d },
  animation: {
    enabled: false,
    loopLengthSec: 10,
    speed: 0.2,
    animateColorBlocks: false,
  },
  cellTypes: applyColorScheme(getDefaultCellTypes(), 'mono'),
  loopSeamlessly: true,
};

type LegacyCellType = CellTypeDef & { weight?: number };

function migrateAnimationSpeed(speed: number | undefined, version: number): number {
  const s = speed ?? defaultState.animation.speed;
  if (version >= 39) return s;
  if (s <= 0.05) return 0.2;
  return Math.min(1, s * 4);
}

function migrateAnimation(parsed: Partial<AppState>['animation'], version: number) {
  const enabled = parsed?.enabled ?? false;
  const animateColorBlocks = parsed?.animateColorBlocks ?? false;
  let speed = migrateAnimationSpeed(parsed?.speed, version);
  let loopLengthSec = parsed?.loopLengthSec ?? defaultState.animation.loopLengthSec;

  if (version < 56) {
    const period = LOOP_BASE_SECONDS / Math.max(speed, 0.05);
    loopLengthSec = nearestLoopLengthPreset(period);
  }

  // v56 derived speed from loop length only — restore independent speed control.
  if (version >= 56 && version < 57) {
    if (Math.abs(speed - baseRateForLoopLength(loopLengthSec)) < 0.01) {
      speed = defaultState.animation.speed;
    }
  }

  return { enabled, animateColorBlocks, speed, loopLengthSec };
}

function migrateCellTypes(parsed: Partial<AppState>, version: number): ReturnType<typeof getDefaultCellTypes> {
  let cellTypes =
    needsCellTypeMigration(parsed.cellTypes ?? []) || version < 6
      ? getDefaultCellTypes()
      : (parsed.cellTypes ?? defaultState.cellTypes);

  cellTypes = cellTypes.filter(
    (t) =>
      t.id !== 'grid-edge' &&
      t.id !== 'dot-halo' &&
      t.id !== 'solid-core' &&
      !t.id.startsWith('shade-') &&
      t.id !== 'silhouette',
  );

  const existingIds = new Set(cellTypes.map((t) => t.id));
  for (const def of getDefaultCellTypes()) {
    if (!existingIds.has(def.id)) cellTypes.push(def);
  }

  cellTypes = cellTypes.map((t) => {
    const legacy = t as LegacyCellType;
    const density = legacy.density ?? legacy.weight ?? 0;
    return {
      ...t,
      density,
      fillInset: t.fillInset ?? (t.mode === 'fill' ? 0.04 : t.mode === 'crosshatch' ? 0.06 : 0),
      hatchSpacing: t.hatchSpacing ?? 4,
      hatchAngle: t.hatchAngle ?? 45,
    };
  });

  if (version < 37) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.empty && t.density <= 0 ? { ...t, density: 0.35 } : t,
    );
  }

  if (version < 42) {
    cellTypes = cellTypes.map((t) => {
      if (t.id === TYPE_IDS.grid && Math.abs(t.density - 0.35) < 0.01) {
        return { ...t, density: 0.22 };
      }
      if (t.id === TYPE_IDS.dot && Math.abs(t.density - 0.3) < 0.01) {
        return { ...t, density: 0.39 };
      }
      if (t.id === TYPE_IDS.solid && Math.abs(t.density - 0.35) < 0.01) {
        return { ...t, density: 0.39 };
      }
      return t;
    });
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  if (version < 43) {
    cellTypes = cellTypes.map((t) => {
      if (t.id === TYPE_IDS.grid && Math.abs(t.density - 0.22) < 0.01) {
        return { ...t, density: 0.2 };
      }
      if (t.id === TYPE_IDS.dot && Math.abs(t.density - 0.39) < 0.01) {
        return { ...t, density: 0.26 };
      }
      if (t.id === TYPE_IDS.solid && Math.abs(t.density - 0.39) < 0.01) {
        return { ...t, density: 0.54 };
      }
      return t;
    });
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  if (version < 44) {
    cellTypes = cellTypes.map((t) => {
      if (t.id === TYPE_IDS.grid && Math.abs(t.density - 0.2) < 0.01) {
        return { ...t, density: 0.38 };
      }
      if (t.id === TYPE_IDS.dot && Math.abs(t.density - 0.26) < 0.01) {
        return { ...t, density: 0.15 };
      }
      if (t.id === TYPE_IDS.solid && Math.abs(t.density - 0.54) < 0.01) {
        return { ...t, density: 0.47 };
      }
      return t;
    });
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  if (version < 46) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.crosshatch && t.enabled ? { ...t, enabled: false } : t,
    );
  }

  if (version < 47) {
    cellTypes = cellTypes.map((t) =>
      t.mode === 'fill' && Math.abs((t.fillInset ?? 0.04) - 0.04) < 0.005
        ? { ...t, fillInset: 0.02 }
        : t,
    );
  }

  if (version < 48) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.outline && t.enabled ? { ...t, enabled: false } : t,
    );
  }

  if (version < 50) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.dot && Math.abs(t.circleRadius - 0.46) < 0.005
        ? { ...t, circleRadius: 0.48 }
        : t,
    );
  }

  if (version < 51) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.empty && Math.abs(t.density - 0.35) < 0.01
        ? { ...t, density: 0.55 }
        : t,
    );
  }

  if (version < 53) {
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  if (version < 55) {
    cellTypes = cellTypes.map((t) => {
      if (t.id === TYPE_IDS.dot && t.density <= 0.16) {
        return { ...t, density: 0.26 };
      }
      return t;
    });
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  if (version < 58) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.empty && Math.abs(t.density - 0.55) < 0.01
        ? { ...t, density: 0.38 }
        : t,
    );
  }

  if (version < 59) {
    cellTypes = cellTypes.map((t) =>
      t.mode === 'fill' && (t.fillInset ?? 0.04) <= 0
        ? { ...t, fillInset: 0.04 }
        : t,
    );
  }

  if (version < 60) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.solid && (t.fillInset ?? 0.04) < 0.04
        ? { ...t, fillInset: 0.04 }
        : t,
    );
  }

  if (version < 61) {
    cellTypes = cellTypes.map((t) =>
      t.id === TYPE_IDS.empty && Math.abs(t.density - 0.38) < 0.01
        ? { ...t, density: 0.28 }
        : t,
    );
  }

  if (version < 62) {
    cellTypes = cellTypes.map((t) => {
      if (t.id === TYPE_IDS.empty && Math.abs(t.density - 0.28) < 0.01) {
        return { ...t, density: 0.22 };
      }
      if (t.id === TYPE_IDS.dot && Math.abs(t.density - 0.26) < 0.01) {
        return { ...t, density: 0.28 };
      }
      if (t.id === TYPE_IDS.hexagon && Math.abs(t.density - 0.14) < 0.01) {
        return { ...t, density: 0.10 };
      }
      if (t.id === TYPE_IDS.solid && Math.abs(t.density - 0.30) < 0.01) {
        return { ...t, density: 0.32 };
      }
      if (t.id === TYPE_IDS.logo && Math.abs(t.density - 1) < 0.01) {
        return { ...t, density: 0.85 };
      }
      return t;
    });
    cellTypes = normalizeBulkDensities(cellTypes);
  }

  return filterPatternCellTypes(mergeCellTypeDefaults(cellTypes));
}

function applyLegacyAccentMigration(
  cellTypes: ReturnType<typeof getDefaultCellTypes>,
  parsed: Partial<AppState> & {
    stateVersion?: number;
    accentPlacement?: {
      logoDensity?: number;
      crosshatchDensity?: number;
      outlineDensity?: number;
      crosshatchDepth?: number;
      outlineDepth?: number;
    };
  },
): ReturnType<typeof getDefaultCellTypes> {
  if ((parsed.stateVersion ?? 0) >= 36) return cellTypes;

  const ap = parsed.accentPlacement;
  if (!ap) return cellTypes;

  const densityById: Partial<Record<string, number>> = {
    [TYPE_IDS.logo]: ap.logoDensity,
    [TYPE_IDS.crosshatch]: ap.crosshatchDensity,
    [TYPE_IDS.outline]: ap.outlineDensity,
  };

  return cellTypes.map((t) => {
    let next = { ...t };
    const migratedDensity = densityById[t.id];
    if (migratedDensity != null && next.density <= 0) {
      next = { ...next, density: migratedDensity };
    }
    if (t.id === TYPE_IDS.crosshatch && ap.crosshatchDepth != null && next.borderDepth == null) {
      next = { ...next, borderDepth: ap.crosshatchDepth };
    }
    if (t.id === TYPE_IDS.outline && ap.outlineDepth != null && next.borderDepth == null) {
      next = { ...next, borderDepth: ap.outlineDepth };
    }
    return next;
  });
}

function migrateState(parsed: Partial<AppState> & { stateVersion?: number }): AppState {
  const version = parsed.stateVersion ?? 0;
  let cellTypes = migrateCellTypes(parsed, version);
  cellTypes = applyLegacyAccentMigration(cellTypes, parsed);
  const legacyScheme = parsed.colorSchemeId as string | undefined;
  const migratedScheme =
    legacyScheme && REMOVED_COLOR_SCHEME_MAP[legacyScheme]
      ? REMOVED_COLOR_SCHEME_MAP[legacyScheme]
      : legacyScheme;
  const rawScheme = migratedScheme;
  const colorSchemeId: ColorSchemeId =
    typeof rawScheme === 'string' && isColorSchemeId(rawScheme)
      ? rawScheme
      : defaultState.colorSchemeId;
  const seed = parsed.seed ?? defaultState.seed;
  const colorFieldSeed =
    colorSchemeId === 'random'
      ? parsed.colorFieldSeed ?? seed
      : undefined;
  cellTypes = applyColorScheme(
    cellTypes,
    colorSchemeId,
    colorFieldSeedForState(colorSchemeId, seed, colorFieldSeed),
  );
  const cols = parsed.cols ?? defaultState.cols;
  const rows = parsed.rows ?? defaultState.rows;

  return {
    ...defaultState,
    seed,
    cols,
    rows,
    cellSize: parsed.cellSize ?? defaultState.cellSize,
    generateMode:
      parsed.generateMode === 'shapes3d' || parsed.generateMode === 'gradient'
        ? parsed.generateMode
        : defaultState.generateMode,
    colorSchemeId,
    colorFieldSeed,
    shapeNoise: { ...defaultShapeNoise },
    shape3d: {
      kind: normalizeShape3dKind(parsed.shape3d?.kind),
      position: {
        x: parsed.shape3d?.position?.x ?? defaultShape3d.position.x,
        y: parsed.shape3d?.position?.y ?? defaultShape3d.position.y,
        z: parsed.shape3d?.position?.z ?? defaultShape3d.position.z,
      },
      scale: parsed.shape3d?.scale ?? defaultShape3d.scale,
      rotationX: parsed.shape3d?.rotationX ?? defaultShape3d.rotationX,
      rotationY: parsed.shape3d?.rotationY ?? defaultShape3d.rotationY,
    },
    animation: migrateAnimation(parsed.animation, version),
    cellTypes,
    loopSeamlessly: parsed.loopSeamlessly ?? defaultState.loopSeamlessly,
  };
}

export function loadState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved) as Partial<AppState> & { stateVersion?: number };
    return migrateState(parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, stateVersion: STATE_VERSION }),
  );
}

export function resetToDefaultState(): AppState {
  const fresh = structuredClone(defaultState);
  saveState(fresh);
  return fresh;
}
