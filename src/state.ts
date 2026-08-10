import type { AppState } from './types';
import { getDefaultCellTypes, needsCellTypeMigration } from './cellTypes';
import { getDefaultColorSchemes } from './colorSchemes';

const STORAGE_KEY = 'gridPatternState';
const STATE_VERSION = 2;

export const defaultState: AppState = {
  seed: 'pattern-2024',
  cols: 60,
  rows: 34,
  cellSize: 16,
  shapeNoise: {
    scale: 0.045,
    octaves: 2,
    persistence: 0.35,
  },
  colorNoise: {
    enabled: false,
    scale: 0.04,
    octaves: 2,
    persistence: 0.5,
    seedOffset: 100,
  },
  animation: {
    speed: 0.06,
    colorDrift: 0.15,
  },
  adjacency: {
    blobHalosEnabled: true,
    haloSizeThreshold: 8,
  },
  cellTypes: getDefaultCellTypes(),
  colorSchemes: getDefaultColorSchemes(),
  activeSchemeId: 'monochrome',
  loopSeamlessly: true,
};

function migrateState(parsed: Partial<AppState> & { stateVersion?: number }): AppState {
  const cellTypes =
    needsCellTypeMigration(parsed.cellTypes ?? []) || (parsed.stateVersion ?? 0) < STATE_VERSION
      ? getDefaultCellTypes()
      : (parsed.cellTypes ?? defaultState.cellTypes);

  // Strip animateSpeed from old noise params if present
  const shapeNoise = {
    ...defaultState.shapeNoise,
    ...(parsed.shapeNoise as object),
  };
  delete (shapeNoise as Record<string, unknown>).animateSpeed;

  const colorNoise = {
    ...defaultState.colorNoise,
    ...(parsed.colorNoise as object),
  };
  delete (colorNoise as Record<string, unknown>).animateSpeed;

  return {
    ...defaultState,
    ...parsed,
    shapeNoise,
    colorNoise,
    animation: { ...defaultState.animation, ...parsed.animation },
    adjacency: { ...defaultState.adjacency, ...parsed.adjacency },
    cellTypes,
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

export function getActiveScheme(state: AppState) {
  return (
    state.colorSchemes.find((s) => s.id === state.activeSchemeId) ??
    state.colorSchemes[0]
  );
}
