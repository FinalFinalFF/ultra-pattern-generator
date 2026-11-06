# Ultra Pattern Generator

A browser tool for generating Ultra Security grid patterns. It mixes line meshes, dots, hexagons, solid shapes, logo marks, outlines and crosshatch, clustered by noise fields, 3D shapes or gradients. Patterns can be animated and exported as SVG, PNG or MP4, or copied straight into Figma.

## Requirements

- Node.js 22.12 or newer (`.nvmrc` pins 24; run `nvm use` to match)
- npm (a `package-lock.json` is committed, so use `npm ci` for a clean install)

No accounts, API keys or environment variables are needed. Everything runs in the browser.

## Local development

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck, then build to dist/
npm run preview    # serve the production build locally
npm run verify     # headless checks: 3D shape coverage, logo placement, color shapes
```

`npm run build` fails on any type error or unused variable. Run `npm run build && npm run verify`
before every push.

## Features

- **Three generate modes**: Pattern (Simplex-noise clusters), 3D shapes (ray-traced SDF scene,
  fixed 72×72 grid), and Gradient (mesh and ribbon density bands)
- **Accent placement**: outline, crosshatch and logo overlays along region borders
- **Color schemes**: mono, per-hue brand pairs, color blocks (rectangles), color shapes (organic
  regions that step along the cells like the pattern's own blobs), and three generated palettes
  (Random, Brand random, Brand pure)
- **Cell type editor**: add, edit, remove and reorder types; parametric modes or custom SVG upload
- **Animation**: loops seamlessly; MP4 length snaps to whole loop periods
- **Export**: SVG, PNG, MP4 (encoded in the browser with WebCodecs), and Copy to Figma (SVG
  with symbols inlined so Figma keeps the colors)
- **Saved patterns** and all settings persist in the browser's localStorage
- **Collapsible sidebar**: click any section title to fold it; Cell Types and Animation start folded, and your choices are remembered

## Deploy to Netlify

1. In [Netlify](https://app.netlify.com/), choose **Add new site** → **Import from Git**
2. Push this project to your own Git repository and select it
3. The build settings come from `netlify.toml` (command `npm run build`, publish directory
   `dist`); the Node version comes from `.nvmrc`
4. Deploy. Every push to `main` rebuilds automatically

The output is a static site, so any static host works: run `npm run build` and upload `dist/`.

FinalFinal keeps its own copy at [ultra.fnfn.us](https://ultra.fnfn.us). Your deployment is
independent of it.

## Fonts

All fonts are served from `public/fonts/` and are open source. Ultra's brand typeface, Aeonik,
is licensed for the logo mark only, not for web use, so the app doesn't use it.

| Font | Used for | License |
| --- | --- | --- |
| Inter (variable, Latin subset) | Wordmark, display and interface text | SIL Open Font License, `public/fonts/OFL-Inter.txt` |
| DM Mono | Labels and numbers | SIL Open Font License, `public/fonts/OFL-DM-Mono.txt` |

## Maintenance notes

- **Saved settings carry a version.** `AppState` is stored in localStorage with
  `STATE_VERSION` (`src/state.ts`). Any change to the state shape, the default cell types or the
  color scheme ids needs a version bump and a migration block in `migrateState()`, or returning
  users load a broken configuration.
- **One renderer.** `buildSvgMarkup()` in `src/renderCanvas.ts` produces the preview, SVG, PNG
  and every MP4 frame, which is why exports match the preview exactly. Add new drawing there.
- **Animation is a pure function of time.** Don't keep state between frames in the generators;
  seamless loops depend on any frame being reproducible from its timestamp.
- `CLAUDE.md` has a fuller architecture guide (data flow, density rules, UI wiring).

## Browser support

Current Chrome, Edge, Firefox and Safari, including MP4 export. MP4 export needs WebCodecs
(`VideoEncoder`), which every current version of these browsers has.

## Project structure

```
src/
  main.ts             App boot, control wiring, animation loop
  types.ts            AppState, GeneratorContext, RenderContext, TYPE_IDS

  generate.ts         Mode dispatch — pattern / shapes3d / gradient
  noise.ts            Seeded Simplex noise + hashSeed
  flowField.ts        Flow advection that warps the noise fields
  shapeZones.ts       Noise-based cell type assignment (pattern mode)
  adjacency.ts        Void island merging, speckle removal, void capping
  accentPlacement.ts  Outline, crosshatch, and logo placement along borders
  animation.ts        Phase from time, loop periods, seamless export timing

  shapes3d.ts         SDF ray marching (fixed 72x72 grid)
  shapes3dMapping.ts  Shade band to cell type mapping
  shapes3dVisual.ts   Per-band visual density scaling
  shape3dDrag.ts      Drag-to-rotate on the preview

  gradientMode.ts     Mesh/ribbon density field, quantized into bands
  gradientMapping.ts  Density band to cell type mapping

  cellTypes.ts        Cell type model, density normalization, classification
  cellTypeUi.ts       Cell type management panel
  svgSymbols.ts       SVG symbol cache and upload
  logoCell.ts         Logo mark markup and symbol id

  renderCanvas.ts     SVG markup (source of truth), canvas rasterize, SVG download
  previewChrome.ts    Preview zoom, fit, and pixel-size readout
  seedNames.ts        Short Ultra Security adjective-noun-number seed names
  savedPatterns.ts    Saved pattern list in localStorage
  meshLines.ts        Shared-edge grid line collection
  hatch.ts            Hatch, outline, and crosshatch cell drawing
  hexagon.ts          Hexagon geometry
  export.ts           MP4 recording via WebCodecs + Mediabunny

  colorSchemes.ts     Scheme definitions + seeded palette generators
  brandColors.ts      Brand palette, shade ramps, contrast math
  colorBlocks.ts      Color block and color shape layouts, palette cycling
  state.ts            localStorage persistence and migrations
  styles.css          App styles
```
