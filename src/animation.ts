import type { AnimationParams } from './types';

/** Phase units completed per animation cycle at speed 1.0. */
export const LOOP_BASE_SECONDS = 20;

export const LOOP_LENGTH_PRESETS = [3, 5, 10, 20] as const;

export type ExportTimingMode = 'wall' | 'loop';

export interface ExportFrameSpec {
  time: number;
}

/** Phase rate at speed 1.0 for a given loop length. */
export function baseRateForLoopLength(loopLengthSec: number): number {
  return LOOP_BASE_SECONDS / Math.max(loopLengthSec, 1);
}

/** Combined loop length + speed slider → phase advancement per second. */
export function getPhaseRate(animation: AnimationParams): number {
  return baseRateForLoopLength(animation.loopLengthSec) * animation.speed;
}

export function getAnimationPhase(time: number, animation: AnimationParams): number {
  if (!animation.enabled || animation.speed <= 0) return 0;
  return time * getPhaseRate(animation);
}

export function getColorBlocksPhase(time: number, animation: AnimationParams): number {
  if (!animation.animateColorBlocks || animation.speed <= 0) return 0;
  return time * getPhaseRate(animation);
}

/** Wall-clock seconds for one seamless cycle at the current speed. */
export function getLoopPeriod(animation: AnimationParams): number {
  return animation.loopLengthSec / Math.max(animation.speed, 0.05);
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Snap export to whole loop cycles so the last frame matches the first. */
export function resolveSeamlessExport(
  requestedSec: number,
  animation: AnimationParams,
  loopSeamlessly: boolean,
): { durationSec: number; mode: ExportTimingMode; loopCount: number } {
  if (!loopSeamlessly) {
    return { durationSec: requestedSec, mode: 'wall', loopCount: 0 };
  }

  const period = getLoopPeriod(animation);
  const loopCount = Math.max(1, Math.round(requestedSec / period));
  return { durationSec: loopCount * period, mode: 'loop', loopCount };
}

/** Wall-clock animation time for one export frame. */
export function exportFrameSpec(
  frame: number,
  totalFrames: number,
  fps: number,
  exportDurationSec: number,
  mode: ExportTimingMode,
): ExportFrameSpec {
  if (mode === 'loop') {
    if (totalFrames <= 1) return { time: 0 };
    return { time: (frame / (totalFrames - 1)) * exportDurationSec };
  }
  return { time: frame / fps };
}

export function nearestLoopLengthPreset(periodSec: number): number {
  let best: number = LOOP_LENGTH_PRESETS[0];
  let bestDelta = Infinity;
  for (const preset of LOOP_LENGTH_PRESETS) {
    const delta = Math.abs(preset - periodSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = preset;
    }
  }
  return best;
}
