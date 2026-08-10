import { initCellTypeUi } from './cellTypeUi';
import { initColorSchemeUi } from './colorSchemeUi';
import { recordMp4, recordMp4Fallback } from './export';
import { generateGrid } from './generate';
import { renderToCanvas } from './renderCanvas';
import { downloadSvg } from './renderSvg';
import { getActiveScheme, loadState, saveState } from './state';
import { getSvgCache, preloadTypeSvgs } from './svgSymbols';
import type { AppState, GridCell, RenderContext } from './types';

let state: AppState = loadState();
let grid: GridCell[][] = [];
let smoothedTime = 0;
let animationId: number | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const canvas = document.getElementById('preview') as HTMLCanvasElement;

function debouncedRender(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    render(smoothedTime);
    saveState(state);
  }, 50);
}

function buildGeneratorContext(time: number) {
  return {
    seed: state.seed,
    cols: state.cols,
    rows: state.rows,
    cellTypes: state.cellTypes,
    shapeNoise: state.shapeNoise,
    colorNoise: state.colorNoise,
    animation: state.animation,
    adjacency: state.adjacency,
    activeScheme: getActiveScheme(state),
    time,
  };
}

function buildRenderContext(): RenderContext {
  const scheme = getActiveScheme(state);
  return {
    grid,
    cellTypes: state.cellTypes,
    activeScheme: scheme,
    colorNoiseEnabled: state.colorNoise.enabled,
    cellSize: state.cellSize,
    cols: state.cols,
    rows: state.rows,
  };
}

function render(time = smoothedTime): void {
  grid = generateGrid(buildGeneratorContext(time));
  renderToCanvas(canvas, buildRenderContext(), getSvgCache());
}

function renderFrame(time: number): void {
  grid = generateGrid(buildGeneratorContext(time));
  renderToCanvas(canvas, buildRenderContext(), getSvgCache());
}

function startAnimationLoop(): void {
  if (animationId !== null) return;
  let last = performance.now();
  const tick = (now: number) => {
    const rawDt = Math.min((now - last) / 1000, 0.033);
    last = now;
    if (state.animation.speed > 0) {
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

function syncUiFromState(): void {
  (document.getElementById('seed') as HTMLInputElement).value = state.seed;
  (document.getElementById('cols') as HTMLInputElement).value = String(state.cols);
  (document.getElementById('rows') as HTMLInputElement).value = String(state.rows);
  (document.getElementById('cellSize') as HTMLInputElement).value = String(state.cellSize);
  (document.getElementById('cellSizeVal')!).textContent = String(state.cellSize);
  (document.getElementById('colorNoiseEnabled') as HTMLInputElement).checked = state.colorNoise.enabled;
  (document.getElementById('loopSeamlessly') as HTMLInputElement).checked = state.loopSeamlessly;
  (document.getElementById('blobHalosEnabled') as HTMLInputElement).checked = state.adjacency.blobHalosEnabled;
}

function initControls(): void {
  document.getElementById('seed')!.addEventListener('input', (e) => {
    state.seed = (e.target as HTMLInputElement).value;
    debouncedRender();
  });

  document.getElementById('randomizeBtn')!.addEventListener('click', () => {
    state.seed = `pattern-${Date.now()}`;
    (document.getElementById('seed') as HTMLInputElement).value = state.seed;
    debouncedRender();
  });

  document.getElementById('cols')!.addEventListener('change', (e) => {
    state.cols = Math.min(120, Math.max(10, parseInt((e.target as HTMLInputElement).value, 10) || 60));
    debouncedRender();
  });

  document.getElementById('rows')!.addEventListener('change', (e) => {
    state.rows = Math.min(120, Math.max(10, parseInt((e.target as HTMLInputElement).value, 10) || 34));
    debouncedRender();
  });

  bindRange('cellSize', 'cellSizeVal', () => state.cellSize, (v) => { state.cellSize = v; });

  bindRange('shapeScale', 'shapeScaleVal', () => state.shapeNoise.scale, (v) => { state.shapeNoise.scale = v; }, (v) => v.toFixed(3));
  bindRange('shapeOctaves', 'shapeOctavesVal', () => state.shapeNoise.octaves, (v) => { state.shapeNoise.octaves = v; });
  bindRange('shapePersist', 'shapePersistVal', () => state.shapeNoise.persistence, (v) => { state.shapeNoise.persistence = v; }, (v) => v.toFixed(2));
  bindRange('undulationSpeed', 'undulationSpeedVal', () => state.animation.speed, (v) => { state.animation.speed = v; }, (v) => v.toFixed(2));
  bindRange('colorDrift', 'colorDriftVal', () => state.animation.colorDrift, (v) => { state.animation.colorDrift = v; }, (v) => v.toFixed(2));

  bindRange('colorScale', 'colorScaleVal', () => state.colorNoise.scale, (v) => { state.colorNoise.scale = v; }, (v) => v.toFixed(3));
  bindRange('colorOctaves', 'colorOctavesVal', () => state.colorNoise.octaves, (v) => { state.colorNoise.octaves = v; });
  bindRange('colorPersist', 'colorPersistVal', () => state.colorNoise.persistence, (v) => { state.colorNoise.persistence = v; }, (v) => v.toFixed(2));
  bindRange('colorOffset', 'colorOffsetVal', () => state.colorNoise.seedOffset, (v) => { state.colorNoise.seedOffset = v; });
  bindRange('haloThreshold', 'haloThresholdVal', () => state.adjacency.haloSizeThreshold, (v) => { state.adjacency.haloSizeThreshold = v; });

  document.getElementById('colorNoiseEnabled')!.addEventListener('change', (e) => {
    state.colorNoise.enabled = (e.target as HTMLInputElement).checked;
    debouncedRender();
  });

  document.getElementById('blobHalosEnabled')!.addEventListener('change', (e) => {
    state.adjacency.blobHalosEnabled = (e.target as HTMLInputElement).checked;
    debouncedRender();
  });

  document.getElementById('loopSeamlessly')!.addEventListener('change', (e) => {
    state.loopSeamlessly = (e.target as HTMLInputElement).checked;
    saveState(state);
  });

  document.getElementById('regenerateBtn')!.addEventListener('click', () => render());

  document.getElementById('downloadSvgBtn')!.addEventListener('click', () => {
    downloadSvg(buildRenderContext(), state.seed);
  });

  document.getElementById('recordMp4Btn')!.addEventListener('click', async () => {
    const duration = parseInt((document.getElementById('recordDuration') as HTMLSelectElement).value, 10);
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

    const loopPeriod = 10;
    const fps = state.cols * state.rows > 8000 ? 15 : 30;

    try {
      await recordMp4(
        canvas,
        duration,
        fps,
        onProgress,
        renderFrame,
        loopPeriod,
        state.loopSeamlessly,
      );
    } catch {
      try {
        await recordMp4Fallback(canvas, duration, fps, onProgress, renderFrame);
      } catch (err) {
        alert(`Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } finally {
      btn.disabled = false;
      render();
    }
  });
}

async function init(): Promise<void> {
  syncUiFromState();
  initControls();

  initCellTypeUi(
    document.getElementById('cellTypePanel')!,
    () => state,
    (s) => { state = s; },
    debouncedRender,
  );

  initColorSchemeUi(
    document.getElementById('colorSchemePanel')!,
    () => state,
    (s) => { state = s; },
    debouncedRender,
  );

  await preloadTypeSvgs(state.cellTypes);
  render();
  startAnimationLoop();
}

init();
