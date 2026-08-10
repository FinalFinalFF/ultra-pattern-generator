# Grid Pattern Generator

Generate organic grid patterns that mix line meshes, dots, and solid shapes — clustered by Simplex noise fields. Edit cell types, color schemes, animate patterns, and export as SVG or MP4.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
npm run preview    # serve production build locally
```

## Features

- **Shape noise** — clusters cell types (empty, grid lines, dots, solids) into organic blobs
- **Color noise** — independent noise field clusters scheme colors across the grid
- **Cell type editor** — add, edit, remove, reorder types; parametric modes or custom SVG upload
- **Color scheme editor** — multiple schemes with add/edit/remove colors
- **SVG export** — clean vector output
- **MP4 recording** — frame capture + ffmpeg.wasm conversion
- **Settings persist** in localStorage

## Deploy to Netlify

### 1. Initialize git and push to GitHub

```bash
cd ~/grid-pattern-generator
git init
git add -A
git commit -m "Initial commit: grid pattern generator"
gh repo create grid-pattern-generator --private --source=. --push
```

Or create a repo manually on GitHub, then:

```bash
git remote add origin git@github.com:YOUR_USER/grid-pattern-generator.git
git push -u origin main
```

### 2. Connect Netlify

1. In [Netlify](https://app.netlify.com/) → **Add new site** → **Import from Git**
2. Select your GitHub repo
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
  generate.ts       Dual-field grid generation
  cellTypes.ts      Cell type model + classification
  colorSchemes.ts   Color scheme presets
  renderCanvas.ts   Canvas rendering + color resolution
  renderSvg.ts      SVG export
  export.ts         MP4 recording via ffmpeg.wasm
  cellTypeUi.ts     Cell type management panel
  colorSchemeUi.ts  Color scheme management panel
  state.ts          localStorage persistence
```
