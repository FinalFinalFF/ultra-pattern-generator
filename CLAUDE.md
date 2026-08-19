# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # copies ffmpeg core, then vite on :5173
npm run build      # copy-ffmpeg → tsc (typecheck, noEmit) → vite build → dist/
npm run preview    # serve dist/
```

`npm run copy-ffmpeg` (a prerequisite of both `dev` and `build`) copies `@ffmpeg/core` into `public/ffmpeg/`, which is gitignored. Without it MP4 export 404s at runtime — never skip it by running bare `vite`.

There is no test framework. Invariants are checked by two headless verification scripts:

```bash
npx tsx scripts/verify-3d.ts      # SDF ray-hit rates across seeds and all 9 shape kinds
npx tsx scripts/verify-logos.ts   # logo cells sit on valid type boundaries
```

`tsx` is deliberately not a dependency; `node --experimental-strip-types` will **not** work because `src/` modules use extensionless import specifiers that only a bundler-style resolver handles.

`tsc` runs with `noUnusedLocals` / `noUnusedParameters`, so an unused variable fails the build. Prefix intentionally-unused params with `_` (see `hasEditableDensity` in `src/cellTypes.ts`).

Deploy is Netlify from `netlify.toml` (`main` → auto build). `scripts/netlify-drop-deploy.mjs` is a separate anonymous "drop" uploader for `dist/` that needs no account.

## Architecture

Vanilla TypeScript + Vite. No framework, no router, no component layer — one page, direct DOM manipulation.

### Data flow

```
AppState (localStorage)  →  GeneratorContext  →  generateGrid()  →  GridCell[][]
                         →  RenderContext     →  buildSvgMarkup()
                                                 ├─ renderToSvg()               → live preview
                                                 └─ rasterizeContextToCanvas()  → MP4 frames
```

`src/types.ts` defines all three context shapes and is the place to start when tracing anything. `AppState` is the persisted shape; `GeneratorContext` and `RenderContext` are per-frame derivations built in `main.ts` (`buildGeneratorContext`, `buildRenderContext`).

**`buildSvgMarkup()` in `renderCanvas.ts` is the single rendering source of truth.** MP4 export rasterizes that same SVG string into a canvas, which is why exports match the preview pixel-for-pixel. Any new render mode must be added there. Note `renderToCanvas()` is a legacy direct-canvas renderer with no callers — do not extend it, and don't assume it stays in sync. `renderCellPreview()` (used by the cell-type panel) is a separate small per-cell canvas path.

### Three generate modes

`generateGrid()` (`src/generate.ts`) branches on `GenerateMode` into three unrelated assignment strategies that all emit the same `GridCell[][]`:

- **`pattern`** — `shapeZones.ts` samples Simplex noise fields (advected by `flowField.ts`) to cluster cell types into organic blobs → `adjacency.ts` post-process → `accentPlacement.ts`.
- **`shapes3d`** — `shapes3d.ts` ray-marches an SDF scene and maps shading bands to cell types via `shapes3dMapping.ts`. **Forces a fixed 72×72 grid** (`SHAPES3D_COLS/ROWS`), ignoring `state.cols/rows`; `renderDims()` in `main.ts` handles this, so use it rather than reading `state.cols` when sizing anything.
- **`gradient`** — `gradientMode.ts` builds a mesh/ribbon density field and quantizes it into bands mapped by `gradientMapping.ts`.

Only `pattern` mode animates the grid itself (`shouldAnimatePattern`); color-block animation is orthogonal and works with any mode.

### Cell types are the central model

`CellTypeDef` carries both *how often* a type appears (`density`) and *how it draws* (`mode`, colors, `strokeWidth`, `circleRadius`, `fillInset`, hatch params, SVG symbol). Users can add/edit/remove types at runtime through `cellTypeUi.ts`, so nothing may assume a fixed type list — always look types up through the `Map<string, CellTypeDef>` built from `ctx.cellTypes`, keyed by `TYPE_IDS` for the well-known ones.

Density has two distinct meanings (`src/cellTypes.ts`):

- `NOISE_BULK_IDS` — densities are **normalized to sum to 1** and become noise thresholds (`densitiesToThresholds` / `classifyNoise`). Changing one redistributes the others (`redistributeDensities`).
- `BORDER_ZONE_IDS` (outline, crosshatch, logo) — **independent 0–1 probabilities** applied by `accentPlacement.ts` only within `borderDepth` cells of a region boundary. These types are not noise-assigned.

Anything that mutates bulk densities must re-run `normalizeBulkDensities`. `cellTypes.ts` keeps several `@deprecated` aliases (`normalizeWeights`, `weightsToThresholds`, `patchAccentCellTypes`, …) — use the current names in new code.

### Colors live on cell types, not in the scheme

`applyColorScheme()` (`colorSchemes.ts`) rewrites every type's `fill`/`stroke` from the selected scheme. Consequence: switching schemes discards hand-edited per-type colors, and any code that persists colors must run after scheme application, not before. Schemes whose palette is generated rather than fixed are registered in `SEEDED_SCHEME_GENERATORS` (`random`, `brand-random`, `brand-pure`) and detected via `isSeededScheme()` — `getColorScheme`, `colorFieldSeedForState`, state migration, and swatch refresh all branch on that helper, so a new generated scheme only needs a registry entry plus a `COLOR_SCHEMES` record. `color-blocks` is seeded too but drives block *layout* (`colorBlocksLayoutSeed`), not `typeInk`. All of them re-roll `state.colorFieldSeed` on select/re-select (`schemeRerollsOnReselect`).

### Animation is a pure function of time

Phase is always derived (`getAnimationPhase(time, animation)` = `time * rate`), never accumulated across frames, so any frame can be regenerated exactly. `resolveSeamlessExport()` snaps export duration to whole loop periods and `exportFrameSpec()` maps frame index → time, which is what makes MP4 loops seamless. Preserve this purity: do not introduce frame-to-frame state into the generators.

### State persistence and migration

`state.ts` persists `AppState` to `localStorage` under `gridPatternState` with `STATE_VERSION` (currently 64). `migrateState()` is a long chain of `if (version < N)` blocks that patch older saved states — cell type sets, renamed color schemes (`REMOVED_COLOR_SCHEME_MAP`), animation speed rescaling.

**Any change to `AppState`, default cell types, or color scheme ids requires bumping `STATE_VERSION` and adding a migration block**, or users with saved state get a broken or stale config. Migrations that touch bulk densities must end with `normalizeBulkDensities`.

### UI wiring convention

`index.html` contains every control with a hard-coded `id`; `main.ts` reaches them via `getElementById` and helpers (`bindRange`, `syncRange`). Visibility per mode is driven by the CSS classes `.pattern-only-control`, `.shapes3d-only`, `.color-blocks-animation-control`, toggled in `updateModeControls` / `updateAnimationControls`. Adding a control means: markup + id in `index.html`, a bind call in `main.ts`, a field in `AppState`, and a `STATE_VERSION` bump.

Renders are debounced ~50 ms (`debouncedRender`) and save state as a side effect. `needsGridRegeneration()` decides whether a render reuses the existing grid or regenerates — check it before assuming edits take effect.

The README's "Project structure" list is out of date (it predates ~14 modules including the gradient and color-scheme systems); update it when adding or removing a module.
