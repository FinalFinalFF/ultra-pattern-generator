import { sampleNoise, type SimplexNoise } from './noise';
import type { NoiseParams } from './types';

/** Max cell-space drift from flow advection. */
export const FLOW_STRENGTH = 1.4;

/** Spatial scale multiplier for flow angle field (lower = broader fabric folds). */
export const FLOW_SCALE_MULT = 0.22;

/** How fast the flow angle evolves in noise time. */
export const FLOW_TIME_SCALE = 0.35;

/** Global drift direction rotates slowly for fabric-like motion. */
export const FLOW_DRIFT_RATE = 0.4;

export interface FlowOffset {
  dx: number;
  dy: number;
}

/**
 * Low-frequency flow field: advect sample coordinates so the whole pattern
 * shifts coherently like fabric rather than boiling per-cell.
 */
export function flowOffset(
  noise: SimplexNoise,
  col: number,
  row: number,
  phase: number,
  baseParams: NoiseParams,
): FlowOffset {
  const flowParams = {
    scale: baseParams.scale * FLOW_SCALE_MULT,
    octaves: 1,
    persistence: 0.4,
  };

  const angleField = sampleNoise(noise, col, row, phase * FLOW_TIME_SCALE, flowParams, 9001);
  const angle = angleField * Math.PI * 2;

  const drift = phase * FLOW_DRIFT_RATE;
  const magnitude = FLOW_STRENGTH * (0.65 + 0.35 * Math.sin(phase * 0.55 + col * 0.02 + row * 0.02));

  return {
    dx: Math.cos(angle) * magnitude + Math.cos(drift) * FLOW_STRENGTH * 0.25,
    dy: Math.sin(angle) * magnitude + Math.sin(drift) * FLOW_STRENGTH * 0.25,
  };
}
