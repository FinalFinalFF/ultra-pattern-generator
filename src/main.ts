import { initCellTypeUi } from './cellTypeUi';
import { colorBlocksForScheme, colorBlocksLayoutSeed, usesColorBlocks } from './colorBlocks';
import {
  applyColorScheme,
  COLOR_SCHEMES,
  colorFieldSeedForState,
  getColorScheme,
  isSeededScheme,
  resolvePaperColors,
  schemeSwatchStyle,
} from './colorSchemes';
import { getColorBlocksPhase, type ExportFrameSpec } from './animation';
import { recordMp4, recordMp4Fallback } from './export';
import { generateGrid } from './generate';
import { renderToSvg, downloadSvg, rasterizeContextToCanvas } from './renderCanvas';
import { defaultShape3dForKind, measureHitRate, SHAPES3D_COLS, SHAPES3D_ROWS } from './shapes3d';
import { initShape3dDragRotate } from './shape3dDrag';
import { resolveShape3dMapping } from './shapes3dMapping';
import { defaultShape3d, loadState, resetToDefaultState, saveState } from './state';
import { preloadTypeSvgs } from './svgSymbols';
import type {
  AnimationParams,
  AppState,
  ColorSchemeId,
  GenerateMode,
  GridCell,
  RenderContext,
  Shape3dKind,
} from './types';

let state: AppState = loadState();
let grid: GridCell[][] = [];
let smoothedTime = 0;
let animationId: number | null = null;
let exportInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let refreshCellTypeUi: () => void = () => {};

const preview = document.getElementById('preview') as HTMLElement;
const recordCanvas = document.getElementById('recordCanvas') as HTMLCanvasElement;

function debouncedRender(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    render();
    saveState(state);
  }, 50);
}

function renderDims(): { cols: number; rows: number } {
  if (state.generateMode === 'shapes3d') {
    return { cols: SHAPES3D_COLS, rows: SHAPES3D_ROWS };
  }
  return { cols: state.cols, rows: state.rows };
}

function buildGeneratorContext(time: number, animation: AnimationParams = state.animation) {
  return {
    seed: state.seed,
    cols: state.cols,
    rows: state.rows,
    generateMode: state.generateMode,
    cellTypes: state.cellTypes,
    shapeNoise: state.shapeNoise,
    shape3d: state.shape3d,
    animation,
    time,
  };
}

function activeColorFieldSeed(): string | undefined {
  return colorFieldSeedForState(state.colorSchemeId, state.seed, state.colorFieldSeed);
}

function bumpColorFieldSeed(): void {
  state.colorFieldSeed = `cf-${Date.now()}`;
}

function shouldAnimatePattern(): boolean {
  return (
    state.generateMode === 'pattern' &&
    state.animation.enabled &&
    state.animation.speed > 0
  );
}

function shouldAnimateColorBlocks(): boolean {
  return (
    usesColorBlocks(state.colorSchemeId) &&
    state.animation.animateColorBlocks &&
    state.animation.speed > 0
  );
}

function shouldRunPreviewAnimation(): boolean {
  if (exportInProgress) return false;
  return shouldAnimatePattern() || shouldAnimateColorBlocks();
}

function buildRenderContext(time = 0, animation: AnimationParams = state.animation): RenderContext {
  const { cols, rows } = renderDims();
  const paletteSeed = activeColorFieldSeed();
  const { paper, surface } = resolvePaperColors(state.colorSchemeId, paletteSeed);
  const blockPhase = getColorBlocksPhase(time, animation);
  return {
    grid,
    cellTypes: state.cellTypes,
    cellSize: state.cellSize,
    cols,
    rows,
    paper,
    surface,
    colorSchemeId: state.colorSchemeId,
    generateMode: state.generateMode,
    colorBlocks: colorBlocksForScheme(
      state.colorSchemeId,
      colorBlocksLayoutSeed(state.colorSchemeId, state.seed, state.colorFieldSeed),
      cols,
      rows,
      blockPhase,
    ),
  };
}

function refreshColorFieldSwatch(): void {
  for (const scheme of COLOR_SCHEMES) {
    if (!isSeededScheme(scheme.id)) continue;
    const btn = document.querySelector<HTMLButtonElement>(`[data-color-scheme="${scheme.id}"]`);
    const swatch = btn?.querySelector<HTMLElement>('.color-scheme-swatch');
    if (!swatch) continue;
    // Only the active scheme tracks colorFieldSeed; others preview their default palette.
    const seed = scheme.id === state.colorSchemeId ? activeColorFieldSeed() : undefined;
    swatch.style.background = schemeSwatchStyle(getColorScheme(scheme.id, seed));
  }
}

function applyActiveColorScheme(): void {
  state.cellTypes = applyColorScheme(state.cellTypes, state.colorSchemeId, activeColorFieldSeed());
  refreshColorFieldSwatch();
  refreshCellTypeUi();
}

function schemeRerollsOnReselect(id: ColorSchemeId): boolean {
  return isSeededScheme(id) || id === 'color-blocks';
}

function setColorScheme(id: ColorSchemeId): void {
  if (state.colorSchemeId === id) {
    if (schemeRerollsOnReselect(id)) {
      bumpColorFieldSeed();
      applyActiveColorScheme();
      debouncedRender();
    }
    return;
  }
  state.colorSchemeId = id;
  if (schemeRerollsOnReselect(id)) bumpColorFieldSeed();
  else state.colorFieldSeed = undefined;
  applyActiveColorScheme();
  syncColorSchemeUi();
  updateAnimationControls();
  debouncedRender();
}

function syncColorSchemeUi(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-color-scheme]').forEach((btn) => {
    const id = btn.dataset.colorScheme as ColorSchemeId;
    const active = id === state.colorSchemeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function initColorSchemeControls(): void {
  const grid = document.getElementById('colorSchemeGrid')!;
  grid.innerHTML = COLOR_SCHEMES.map(
    (scheme) => `
      <button
        type="button"
        class="color-scheme-btn"
        data-color-scheme="${scheme.id}"
        title="${scheme.name}"
        aria-label="${scheme.name}"
        aria-pressed="false"
      >
        <span class="color-scheme-swatch" style="background:${schemeSwatchStyle(scheme)}"></span>
        <span class="color-scheme-label">${scheme.name}</span>
      </button>`,
  ).join('');

  grid.querySelectorAll<HTMLButtonElement>('[data-color-scheme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setColorScheme(btn.dataset.colorScheme as ColorSchemeId);
    });
  });
  syncColorSchemeUi();
}

function needsGridRegeneration(): boolean {
  if (shouldAnimatePattern()) return true;
  const { cols, rows } = renderDims();
  if (grid.length !== rows || (grid[0]?.length ?? 0) !== cols) return true;
  if (!shouldRunPreviewAnimation()) return true;
  return false;
}

function render(time = shouldRunPreviewAnimation() ? smoothedTime : 0, forceGrid = false): void {
  if (forceGrid || needsGridRegeneration()) {
    grid = generateGrid(buildGeneratorContext(time));
  }
  renderToSvg(preview, buildRenderContext(time));
}

async function renderExportFrame(spec: ExportFrameSpec, animation: AnimationParams): Promise<void> {
  const exportGrid = generateGrid(buildGeneratorContext(spec.time, animation));
  const ctx: RenderContext = { ...buildRenderContext(spec.time, animation), grid: exportGrid };
  await rasterizeContextToCanvas(recordCanvas, ctx);
}

function parseRecordDurationSec(): number {
  return parseInt((document.getElementById('recordDuration') as HTMLSelectElement).value, 10);
}

function setAnimationLoopLength(loopLengthSec: number): void {
  state.animation = { ...state.animation, loopLengthSec };
}

function exportAnimationParams(): AnimationParams {
  const animation = { ...state.animation };
  const colorBlocksAnim =
    usesColorBlocks(state.colorSchemeId) && animation.animateColorBlocks;
  if (!animation.enabled && !colorBlocksAnim && state.generateMode === 'pattern') {
    animation.enabled = true;
  }
  return animation;
}

function updateModeControls(): void {
  const mode = state.generateMode;
  const is3d = mode === 'shapes3d';
  const isGradient = mode === 'gradient';
  document.getElementById('modePattern')!.classList.toggle('active', mode === 'pattern');
  document.getElementById('modeShapes3d')!.classList.toggle('active', is3d);
  document.getElementById('modeGradient')!.classList.toggle('active', isGradient);

  document.querySelectorAll('.pattern-only-control').forEach((el) => {
    el.classList.toggle('hidden', is3d);
  });
  document.querySelectorAll('.shapes3d-only').forEach((el) => {
    el.classList.toggle('hidden', !is3d);
  });
  preview.classList.toggle('preview-3d-orbit', is3d);
  if (is3d) preview.title = 'Drag to rotate';
  else preview.removeAttribute('title');
}

function syncShape3dUi(): void {
  const s = state.shape3d;
  (document.getElementById('shape3dKind') as HTMLSelectElement).value = s.kind;
  syncRange('shape3dPosX', 'shape3dPosXVal', s.position.x, (v) => v.toFixed(2));
  syncRange('shape3dPosY', 'shape3dPosYVal', s.position.y, (v) => v.toFixed(2));
  syncRange('shape3dPosZ', 'shape3dPosZVal', s.position.z, (v) => v.toFixed(2));
  syncRange('shape3dScale', 'shape3dScaleVal', s.scale, (v) => v.toFixed(2));
  syncRange('shape3dRotX', 'shape3dRotXVal', s.rotationX, (v) => String(Math.round(v)));
  syncRange('shape3dRotY', 'shape3dRotYVal', s.rotationY, (v) => String(Math.round(v)));
}

function updateAnimationControls(): void {
  const patternAnim = state.animation.enabled;
  const colorBlocksAnim =
    usesColorBlocks(state.colorSchemeId) && state.animation.animateColorBlocks;
  const animDisabled = !patternAnim && !colorBlocksAnim;
  (document.getElementById('loopLength') as HTMLSelectElement).disabled = animDisabled;
  (document.getElementById('animationSpeed') as HTMLInputElement).disabled = animDisabled;

  document.querySelectorAll('.color-blocks-animation-control').forEach((el) => {
    el.classList.toggle('hidden', !usesColorBlocks(state.colorSchemeId));
  });
}

function startAnimationLoop(): void {
  if (animationId !== null) return;
  let last = performance.now();
  const tick = (now: number) => {
    const rawDt = Math.min((now - last) / 1000, 0.033);
    last = now;
    if (shouldRunPreviewAnimation()) {
      smoothedTime += rawDt;
      render(smoothedTime);
    }
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

function bindRange(
  id: string,
  valId: string,
  get: () => number,
  set: (v: number) => void,
  format: (v: number) => string = String,
): void {
  const input = document.getElementById(id) as HTMLInputElement;
  const label = document.getElementById(valId)!;
  input.value = String(get());
  label.textContent = format(get());
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    set(v);
    label.textContent = format(v);
    debouncedRender();
  });
}

function syncRange(
  id: string,
  valId: string,
  value: number,
  format: (v: number) => string = String,
): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const label = document.getElementById(valId);
  if (!input || !label) return;
  input.value = String(value);
  label.textContent = format(value);
}

function syncUiFromState(): void {
  (document.getElementById('seed') as HTMLInputElement).value = state.seed;
  syncRange('cols', 'colsVal', state.cols);
  syncRange('rows', 'rowsVal', state.rows);
  syncRange('cellSize', 'cellSizeVal', state.cellSize);
  syncShape3dUi();
  syncColorSchemeUi();
  refreshColorFieldSwatch();

  (document.getElementById('animationEnabled') as HTMLInputElement).checked = state.animation.enabled;
  (document.getElementById('animateColorBlocks') as HTMLInputElement).checked =
    state.animation.animateColorBlocks;
  (document.getElementById('loopLength') as HTMLSelectElement).value = String(state.animation.loopLengthSec);
  syncRange('animationSpeed', 'animationSpeedVal', state.animation.speed, (v) => v.toFixed(2));

  (document.getElementById('loopSeamlessly') as HTMLInputElement).checked = state.loopSeamlessly;
  updateModeControls();
  updateAnimationControls();
}

async function resetAllToDefaults(): Promise<void> {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
  state = resetToDefaultState();
  smoothedTime = 0;
  syncUiFromState();
  refreshCellTypeUi();
  await preloadTypeSvgs(state.cellTypes);
  render(0);
}

function setGenerateMode(mode: GenerateMode): void {
  if (state.generateMode === mode) return;
  state.generateMode = mode;
  updateModeControls();
  if (mode === 'shapes3d' && import.meta.env.DEV) {
    const rate = measureHitRate(
      state.seed,
      state.shape3d,
      resolveShape3dMapping(state.cellTypes),
    );
    if (rate < 0.05) {
      console.warn(`3D shapes: very low hit rate (${(rate * 100).toFixed(1)}%) for seed "${state.seed}"`);
    }
  }
  debouncedRender();
}

function patchShape3d(patch: Partial<AppState['shape3d']>): void {
  state.shape3d = { ...state.shape3d, ...patch };
}

function initShape3dControls(): void {
  document.getElementById('shape3dKind')!.addEventListener('change', (e) => {
    const kind = (e.target as HTMLSelectElement).value as Shape3dKind;
    state.shape3d = defaultShape3dForKind(kind);
    syncShape3dUi();
    debouncedRender();
  });

  bindRange('shape3dPosX', 'shape3dPosXVal', () => state.shape3d.position.x, (v) => {
    state.shape3d = { ...state.shape3d, position: { ...state.shape3d.position, x: v } };
  }, (v) => v.toFixed(2));

  bindRange('shape3dPosY', 'shape3dPosYVal', () => state.shape3d.position.y, (v) => {
    state.shape3d = { ...state.shape3d, position: { ...state.shape3d.position, y: v } };
  }, (v) => v.toFixed(2));

  bindRange('shape3dPosZ', 'shape3dPosZVal', () => state.shape3d.position.z, (v) => {
    state.shape3d = { ...state.shape3d, position: { ...state.shape3d.position, z: v } };
  }, (v) => v.toFixed(2));

  bindRange('shape3dScale', 'shape3dScaleVal', () => state.shape3d.scale, (v) => {
    patchShape3d({ scale: v });
  }, (v) => v.toFixed(2));

  bindRange('shape3dRotX', 'shape3dRotXVal', () => state.shape3d.rotationX, (v) => {
    patchShape3d({ rotationX: v });
  }, (v) => String(Math.round(v)));

  bindRange('shape3dRotY', 'shape3dRotYVal', () => state.shape3d.rotationY, (v) => {
    patchShape3d({ rotationY: v });
  }, (v) => String(Math.round(v)));
}

function initControls(): void {
  initColorSchemeControls();

  document.getElementById('modePattern')!.addEventListener('click', () => setGenerateMode('pattern'));
  document.getElementById('modeShapes3d')!.addEventListener('click', () => setGenerateMode('shapes3d'));
  document.getElementById('modeGradient')!.addEventListener('click', () => setGenerateMode('gradient'));

  document.getElementById('seed')!.addEventListener('input', (e) => {
    state.seed = (e.target as HTMLInputElement).value;
    debouncedRender();
  });

  document.getElementById('randomizeBtn')!.addEventListener('click', () => {
    state.seed = `pattern-${Date.now()}`;
    (document.getElementById('seed') as HTMLInputElement).value = state.seed;
    if (schemeRerollsOnReselect(state.colorSchemeId)) {
      bumpColorFieldSeed();
      applyActiveColorScheme();
    }
    debouncedRender();
  });

  document.getElementById('resetAllDefaults')!.addEventListener('click', () => {
    void resetAllToDefaults();
  });

  bindRange('cols', 'colsVal', () => state.cols, (v) => {
    state.cols = Math.round(v);
  });
  bindRange('rows', 'rowsVal', () => state.rows, (v) => {
    state.rows = Math.round(v);
  });
  bindRange('cellSize', 'cellSizeVal', () => state.cellSize, (v) => { state.cellSize = v; });

  initShape3dControls();

  initShape3dDragRotate({
    preview,
    getMode: () => state.generateMode,
    getRotation: () => ({
      x: state.shape3d.rotationX,
      y: state.shape3d.rotationY,
    }),
    setRotation: (x, y) => {
      patchShape3d({ rotationX: x, rotationY: y });
      syncRange('shape3dRotX', 'shape3dRotXVal', x, (v) => String(Math.round(v)));
      syncRange('shape3dRotY', 'shape3dRotYVal', y, (v) => String(Math.round(v)));
    },
    onRotate: () => render(),
    onCommit: () => saveState(state),
  });

  document.getElementById('animationEnabled')!.addEventListener('change', (e) => {
    state.animation.enabled = (e.target as HTMLInputElement).checked;
    if (!state.animation.enabled && !state.animation.animateColorBlocks) {
      smoothedTime = 0;
      render(0);
    }
    updateAnimationControls();
    saveState(state);
  });

  document.getElementById('animateColorBlocks')!.addEventListener('change', (e) => {
    state.animation.animateColorBlocks = (e.target as HTMLInputElement).checked;
    if (!state.animation.enabled && !state.animation.animateColorBlocks) {
      smoothedTime = 0;
      render(0);
    } else if (state.animation.animateColorBlocks) {
      render(smoothedTime);
    }
    updateAnimationControls();
    saveState(state);
  });

  document.getElementById('loopLength')!.addEventListener('change', (e) => {
    setAnimationLoopLength(parseInt((e.target as HTMLSelectElement).value, 10));
    debouncedRender();
  });

  bindRange('animationSpeed', 'animationSpeedVal', () => state.animation.speed, (v) => { state.animation.speed = v; }, (v) => v.toFixed(2));

  document.getElementById('loopSeamlessly')!.addEventListener('change', (e) => {
    state.loopSeamlessly = (e.target as HTMLInputElement).checked;
    saveState(state);
  });

  document.getElementById('regenerateBtn')!.addEventListener('click', () => render(0, true));

  document.getElementById('downloadSvgBtn')!.addEventListener('click', () => {
    downloadSvg(buildRenderContext(), state.seed);
  });

  document.getElementById('recordMp4Btn')!.addEventListener('click', async () => {
    const exportAnimation = exportAnimationParams();
    const duration = parseRecordDurationSec();
    const progress = document.getElementById('recordProgress')!;
    const bar = document.getElementById('progressBar')!;
    const text = document.getElementById('progressText')!;
    const btn = document.getElementById('recordMp4Btn') as HTMLButtonElement;

    progress.classList.remove('hidden');
    btn.disabled = true;

    const onProgress = (msg: string, pct = 0) => {
      bar.style.width = `${pct * 100}%`;
      text.textContent = msg;
    };

    const { cols, rows } = renderDims();
    const fps = cols * rows > 8000 ? 15 : 24;
    const renderFrame = (spec: ExportFrameSpec) => renderExportFrame(spec, exportAnimation);

    if (
      state.generateMode === 'gradient' &&
      !exportAnimation.animateColorBlocks
    ) {
      alert('Gradient mode is static. Switch to Pattern mode, or use Color blocks with animation enabled.');
      progress.classList.add('hidden');
      btn.disabled = false;
      return;
    }

    exportInProgress = true;
    try {
      await recordMp4(
        recordCanvas,
        duration,
        fps,
        onProgress,
        renderFrame,
        exportAnimation,
        state.loopSeamlessly,
      );
    } catch (primaryErr) {
      console.warn('MP4 export failed, trying fallback recorder', primaryErr);
      try {
        await recordMp4Fallback(
          recordCanvas,
          duration,
          fps,
          onProgress,
          renderFrame,
          exportAnimation,
          state.loopSeamlessly,
        );
      } catch (err) {
        const detail =
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        alert(
          `Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}\n\nEncoder error: ${detail}`,
        );
      }
    } finally {
      exportInProgress = false;
      btn.disabled = false;
      render();
    }
  });
}

async function init(): Promise<void> {
  if (!state.shape3d) state.shape3d = { ...defaultShape3d };
  syncUiFromState();
  initControls();

  ({ refresh: refreshCellTypeUi } = initCellTypeUi(
    document.getElementById('cellTypePanel')!,
    () => state,
    (s) => {
      state = s;
    },
    debouncedRender,
  ));

  await preloadTypeSvgs(state.cellTypes);
  render();
  startAnimationLoop();
}

init();
