# Ultra Pattern Generator

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
- **Cell type editor** — add, edit, remove, reorder types; parametric modes or custom SVG upload
- **3D shapes mode** — ray-traced SDF scene mapped to cell types (experimental)
- **SVG export** — clean vector output
- **MP4 recording** — frame capture + ffmpeg.wasm conversion
- **Settings persist** in localStorage

## Deploy to Netlify

1. In [Netlify](https://app.netlify.com/) → **Add new site** → **Import from Git**
2. Select [FinalFinalFF/ultra-pattern-generator](https://github.com/FinalFinalFF/ultra-pattern-generator)
3. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: 20
4. Deploy — every push to `main` rebuilds automatically

## Browser support

- Chrome / Firefox / Edge — full support including MP4 export
- Safari — pattern generation and SVG export; MP4 may require ffmpeg.wasm load

## Project structure

```
src/
  main.ts           App boot, controls, animation loop
  noise.ts          Seeded Simplex noise
  generate.ts       Grid generation (pattern + 3D modes)
  shapeZones.ts     Noise-based shape assignment
  shapes3d.ts       SDF ray tracing for 3D mode
  accentPlacement.ts Outline, crosshatch, logo placement
  adjacency.ts      Blob halos and void fill
  cellTypes.ts      Cell type model + classification
  renderCanvas.ts   Canvas/SVG rendering and export
  export.ts         MP4 recording via ffmpeg.wasm
  cellTypeUi.ts     Cell type management panel
  svgSymbols.ts     SVG symbol cache and upload
  state.ts          localStorage persistence
```
