# Ultra Pattern Generator

**Live:** [ultra.fnfn.us](https://ultra.fnfn.us)

Generate organic grid patterns that mix line meshes, dots, solid shapes, logos, outlines, and crosshatch — clustered by Simplex noise fields. Edit cell types, animate patterns, and export as SVG or MP4.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
npm run preview    # serve production build locally
```

## Features

- **Shape noise** — clusters cell types (empty, grid lines, dots, solids, accents) into organic blobs
- **Accent placement** — outline, crosshatch, and logo overlays on grid carriers
- **Color schemes** — mono, per-hue brand pairs, color blocks, and three generated palettes (Random, Brand random, Brand pure) that assign one color per cell type
- **Cell type editor** — add, edit, remove, reorder types; parametric modes or custom SVG upload
- **3D shapes mode** — ray-traced SDF scene mapped to cell types (experimental)
- **SVG export** — clean vector output
- **MP4 recording** — frame capture + ffmpeg.wasm conversion
- **Settings persist** in localStorage

## Deploy to Netlify

1. In [Netlify](https://app.netlify.com/) → **Add new site** → **Import from Git**
2. Select [FinalFinalFF/ultra-pattern-generator](https://github.com/FinalFinalFF/ultra-pattern-generator)
3. Build settings (auto-detected): build command `npm run build` and publish directory `dist` come
   from `netlify.toml`; Node 20 comes from `.nvmrc`
4. Deploy — every push to `main` rebuilds automatically

`ultra.fnfn.us` is a CNAME to the Netlify site, set to **DNS only** (grey cloud) in Cloudflare so
Netlify can provision and renew its own TLS certificate.

## Browser support

- Chrome / Firefox / Edge — full support including MP4 export
- Safari — pattern generation and SVG export; MP4 may require ffmpeg.wasm load

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
  meshLines.ts        Shared-edge grid line collection
  hatch.ts            Hatch, outline, and crosshatch cell drawing
  hexagon.ts          Hexagon geometry
  export.ts           MP4 recording via ffmpeg.wasm

  colorSchemes.ts     Scheme definitions + seeded palette generators
  brandColors.ts      Brand palette, shade ramps, contrast math
  colorBlocks.ts      Color block layout and palette cycling
  state.ts            localStorage persistence and migrations
  styles.css          App styles
```
