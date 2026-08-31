import { initCellTypeUi } from './cellTypeUi';
import { colorBlocksForScheme, colorBlocksLayoutSeed, usesColorBlocks } from './colorBlocks';
import {
  applyColorScheme,
  COLOR_SCHEMES,
  colorFieldSeedForState,
  getColorScheme,
  isSeededScheme,
  resolvePaperColors,
  schemeRerollsOnReselect,
  schemeSwatchStyle,
} from './colorSchemes';
import { getColorBlocksPhase, type ExportFrameSpec } from './animation';
import { recordMp4 } from './export';
import { generateGrid } from './generate';
import { initPreviewChrome } from './previewChrome';
import { renderToSvg, downloadSvg, downloadPng, copySvgToClipboard, copySvgMarkupToClipboard, rasterizeContextToCanvas, buildSvgMarkup } from './renderCanvas';
import { defaultShape3dForKind, measureHitRate, SHAPES3D_COLS, SHAPES3D_ROWS } from './shapes3d';
import { initShape3dDragRotate } from './shape3dDrag';
import { resolveShape3dMapping } from './shapes3dMapping';
import { defaultShape3d, loadState, resetToDefaultState, saveState } from './state';
import { randomSeedName } from './seedNames';
import { deleteSavedPattern, loadSavedPatterns, reorderSavedPatterns, savePattern } from './savedPatterns';
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
let applyPreviewView = (): void => {};

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

function setSeed(next: string): void {
  state.seed = next;
  (document.getElementById('seed') as HTMLInputElement).value = next;
}

function remixPattern(): void {
  setSeed(randomSeedName());
  debouncedRender();
}

function shuffleColors(): void {
  const ids = COLOR_SCHEMES.map((scheme) => scheme.id);
  const others = ids.filter((id) => id !== state.colorSchemeId);
  const pool = others.length > 0 ? others : ids;
  const next = pool[Math.floor(Math.random() * pool.length)]!;
  setColorScheme(next);
  const btn = document.querySelector<HTMLButtonElement>(`[data-color-scheme="${next}"]`);
  btn?.scrollIntoView({ block: 'nearest' });
  btn?.focus();
}

function flashButton(btn: HTMLButtonElement, label: string, ms = 1400): void {
  const previous = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  window.setTimeout(() => {
    btn.textContent = previous;
    btn.disabled = false;
  }, ms);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderSavedOverlay(): void {
  const items = loadSavedPatterns();
  const grid = document.getElementById('savedGrid')!;
  const empty = document.getElementById('savedEmpty')!;
  empty.classList.toggle('hidden', items.length > 0);
  grid.innerHTML = items
    .map(
      (item) => `
      <div class="saved-card" data-saved-id="${escapeHtml(item.id)}">
        <div class="saved-card-frame">
          <span class="saved-card-grip" title="Drag to reorder" role="button" aria-label="Drag to reorder"></span>
          <button type="button" class="saved-card-delete" aria-label="Delete ${escapeHtml(item.seed)}">×</button>
          <button type="button" class="saved-card-preview" title="Copy SVG">
            <img alt="" src="${svgDataUrl(item.svg)}">
          </button>
        </div>
        <div class="saved-card-meta">
          <span class="saved-card-seed">${escapeHtml(item.seed)}</span>
        </div>
      </div>`,
    )
    .join('');

  grid.querySelectorAll<HTMLElement>('.saved-card').forEach((card) => {
    const id = card.dataset.savedId!;
    const preview = card.querySelector<HTMLButtonElement>('.saved-card-preview')!;
    preview.addEventListener('click', async () => {
      const match = loadSavedPatterns().find((item) => item.id === id);
      if (!match) return;
      try {
        await copySvgMarkupToClipboard(match.svg);
        const seed = card.querySelector('.saved-card-seed');
        if (seed) {
          const prev = seed.textContent;
          seed.textContent = 'Copied';
          window.setTimeout(() => {
            seed.textContent = prev;
          }, 1200);
        }
      } catch (err) {
        alert(`Copy failed: ${err instanceof Error ? err.message : 'Clipboard permission denied'}`);
      }
    });

    card.querySelector('.saved-card-delete')!.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!confirm('Delete this saved pattern?')) return;
      deleteSavedPattern(id);
      renderSavedOverlay();
    });
  });

  bindSavedCardReorder(grid);
}

function bindSavedCardReorder(grid: HTMLElement): void {
  grid.querySelectorAll<HTMLElement>('.saved-card').forEach((card) => {
    const grip = card.querySelector<HTMLElement>('.saved-card-grip');
    grip?.addEventListener('pointerdown', () => {
      card.draggable = true;
    });
    grip?.addEventListener('pointerup', () => {
      if (!card.classList.contains('is-dragging')) card.draggable = false;
    });
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', card.dataset.savedId ?? '');
      event.dataTransfer?.setDragImage(card, 24, 24);
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.draggable = false;
      card.classList.remove('is-dragging');
      const ids = [...grid.querySelectorAll<HTMLElement>('.saved-card')].map((el) => el.dataset.savedId!);
      const current = loadSavedPatterns().map((item) => item.id);
      if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
      reorderSavedPatterns(ids);
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = grid.querySelector<HTMLElement>('.saved-card.is-dragging');
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      if (event.clientX > rect.left + rect.width / 2) card.after(dragging);
      else card.before(dragging);
    });
    card.addEventListener('drop', (event) => event.preventDefault());
  });
}

function setSavedOverlayOpen(open: boolean): void {
  const overlay = document.getElementById('savedOverlay')!;
  overlay.classList.toggle('hidden', !open);
  if (open) {
    renderSavedOverlay();
  } else {
    document.getElementById('savedGrid')!.innerHTML = '';
  }
}

function initSavedPatternsUi(): void {
  document.getElementById('saveBtn')!.addEventListener('click', () => {
    try {
      savePattern(state.seed, buildSvgMarkup(buildRenderContext()));
      flashButton(document.getElementById('saveBtn') as HTMLButtonElement, 'Saved');
      if (!document.getElementById('savedOverlay')!.classList.contains('hidden')) {
        renderSavedOverlay();
      }
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Storage is full'}`);
    }
  });

  document.getElementById('savedOpenBtn')!.addEventListener('click', () => setSavedOverlayOpen(true));
  document.getElementById('savedCloseBtn')!.addEventListener('click', () => setSavedOverlayOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const editorOverlay = document.getElementById('cellTypeEditorOverlay');
    if (editorOverlay && !editorOverlay.classList.contains('hidden')) return;
    if (document.getElementById('savedOverlay')!.classList.contains('hidden')) return;
    setSavedOverlayOpen(false);
  });
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

const REROLL_ICON = `<svg class="color-scheme-reroll-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M13.25 6.25A5.5 5.5 0 1 0 12.6 11.15"/>
  <path d="M13.25 2.75v3.5h-3.5"/>
</svg>`;

function initColorSchemeControls(): void {
  const grid = document.getElementById('colorSchemeGrid')!;
  grid.innerHTML = COLOR_SCHEMES.map((scheme) => {
    const rerolls = schemeRerollsOnReselect(scheme.id);
    const hint = rerolls ? `${scheme.name} — click again to shuffle` : scheme.name;
    return `
      <button
        type="button"
        class="color-scheme-btn${rerolls ? ' is-reroll' : ''}"
        data-color-scheme="${scheme.id}"
        title="${hint}"
        aria-label="${hint}"
        aria-pressed="false"
      >
        <span class="color-scheme-swatch" style="background:${schemeSwatchStyle(scheme)}"></span>
        <span class="color-scheme-meta">
          <span class="color-scheme-label">${scheme.name}</span>
          ${rerolls ? REROLL_ICON : ''}
        </span>
      </button>`;
  }).join('');

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
  applyPreviewView();
}

async function renderExportFrame(spec: ExportFrameSpec, animation: AnimationParams): Promise<void> {
  const exportGrid = generateGrid(buildGeneratorContext(spec.time, animation));
  const ctx: RenderContext = { ...buildRenderContext(spec.time, animation), grid: exportGrid };
  await rasterizeContextToCanvas(recordCanvas, ctx, 1);
}

function parseRecordDurationSec(): number {
  return parseInt((document.getElementById('recordDuration') as HTMLSelectElement).value, 10);
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
  (document.getElementById('animationSpeed') as HTMLInputElement).disabled = animDisabled;
  document.getElementById('animationPlayback')!.classList.toggle('is-disabled', animDisabled);

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
  syncRange('animationSpeed', 'animationSpeedVal', state.animation.speed, (v) => v.toFixed(2));

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

  document.getElementById('remixBtn')!.addEventListener('click', () => {
    remixPattern();
  });

  document.getElementById('shuffleColorsBtn')!.addEventListener('click', () => {
    shuffleColors();
  });

  initSavedPatternsUi();

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

  bindRange('animationSpeed', 'animationSpeedVal', () => state.animation.speed, (v) => { state.animation.speed = v; }, (v) => v.toFixed(2));

  document.getElementById('copyFigmaBtn')!.addEventListener('click', async () => {
    const btn = document.getElementById('copyFigmaBtn') as HTMLButtonElement;
    try {
      await copySvgToClipboard(buildRenderContext());
      const label = btn.textContent;
      btn.textContent = 'Copied';
      btn.disabled = true;
      window.setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 1400);
    } catch (err) {
      alert(`Copy failed: ${err instanceof Error ? err.message : 'Clipboard permission denied'}`);
    }
  });

  document.getElementById('downloadSvgBtn')!.addEventListener('click', () => {
    downloadSvg(buildRenderContext(), state.seed);
  });

  document.getElementById('downloadPngBtn')!.addEventListener('click', async () => {
    const btn = document.getElementById('downloadPngBtn') as HTMLButtonElement;
    btn.disabled = true;
    try {
      await downloadPng(buildRenderContext(), state.seed);
    } catch (err) {
      alert(`PNG export failed: ${err instanceof Error ? err.message : 'Could not rasterize'}`);
    } finally {
      btn.disabled = false;
    }
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
      );
    } catch (err) {
      alert(`Recording failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  ({ apply: applyPreviewView } = initPreviewChrome(() => {
    const { cols, rows } = renderDims();
    return { width: cols * state.cellSize, height: rows * state.cellSize };
  }));

  await preloadTypeSvgs(state.cellTypes);
  render();
  startAnimationLoop();
}

init();
