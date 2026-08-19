import { getFillInset, getLogoSvgScale, getSvgScale, isGridLineCell, isMeshMode } from './cellTypes';
import { hexagonSvgPoints, traceHexagonPath } from './hexagon';
import {
  crosshatchCellToSvg,
  drawCrosshatchCell,
} from './hatch';
import { applyShadeVisualScale } from './shapes3dVisual';
import { getSvgCache, svgMarkupForType, svgViewBoxForType } from './svgSymbols';
import {
  collectMeshLines,
  drawSegments,
  segmentsToSvgLines,
} from './meshLines';
import type {
  CellTypeDef,
  ColorBlock,
  GridCell,
  RenderContext,
  RenderMode,
  ResolvedColors,
} from './types';
import { TYPE_IDS } from './types';

function drawColorBlocks(
  c: CanvasRenderingContext2D,
  blocks: ColorBlock[],
  cellSize: number,
): void {
  for (const block of blocks) {
    c.fillStyle = block.color;
    c.fillRect(block.col * cellSize, block.row * cellSize, block.cols * cellSize, block.rows * cellSize);
  }
}

function colorBlocksSvg(blocks: ColorBlock[], cellSize: number): string {
  return blocks
    .map(
      (b) =>
        `<rect x="${b.col * cellSize}" y="${b.row * cellSize}" width="${b.cols * cellSize}" height="${b.rows * cellSize}" fill="${b.color}"/>`,
    )
    .join('');
}

export function resolveColors(type: CellTypeDef): ResolvedColors {
  return { fill: type.fill, stroke: type.stroke };
}

function resolveCellType(
  typeMap: Map<string, CellTypeDef>,
  cell: GridCell,
): CellTypeDef | undefined {
  const base = typeMap.get(cell.typeId);
  if (!base) return undefined;
  return cell.shadeBand ? applyShadeVisualScale(base, cell.shadeBand) : base;
}

function resolveMeshStroke(typeMap: Map<string, CellTypeDef>): { stroke: string; strokeWidth: number } {
  const lineType = [...typeMap.values()].find((t) => isGridLineCell(t));
  return { stroke: lineType?.stroke ?? '#181818', strokeWidth: lineType?.strokeWidth ?? 1 };
}

function insetFillRect(
  col: number,
  row: number,
  cellSize: number,
  inset: number,
): { x: number; y: number; w: number; h: number } {
  const m = cellSize * inset;
  return {
    x: col * cellSize + m,
    y: row * cellSize + m,
    w: cellSize - 2 * m,
    h: cellSize - 2 * m,
  };
}

function scaledCellRect(cellSize: number, scale: number): { x: number; y: number; size: number } {
  const size = cellSize * scale;
  const inset = (cellSize - size) / 2;
  return { x: inset, y: inset, size };
}

function parseViewBoxSize(viewBox: string): { w: number; h: number } {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  return { w: parts[2] || 100, h: parts[3] || 100 };
}

/** Place each symbol in a nested svg so viewBox maps reliably to cell size. */
function svgSymbolInstance(
  col: number,
  row: number,
  cellSize: number,
  type: CellTypeDef,
  stroke: string,
  scale = getSvgScale(type),
): string {
  const cellX = col * cellSize;
  const cellY = row * cellSize;
  const { x: ox, y: oy, size: s } = scaledCellRect(cellSize, scale);
  const vb = type.svgViewBox ?? '0 0 100 100';
  const { w: vbW, h: vbH } = parseViewBoxSize(vb);
  const id = type.svgSymbolId!;
  const tx = cellX + ox;
  const ty = cellY + oy;
  return `<svg x="${tx}" y="${ty}" width="${s}" height="${s}" viewBox="${vb}" overflow="hidden" color="${stroke}"><use href="#${id}" xlink:href="#${id}" width="${vbW}" height="${vbH}"/></svg>`;
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  ctx: RenderContext,
  svgCache: Map<string, HTMLImageElement>,
  dpr = window.devicePixelRatio || 1,
): void {
  const { grid, cellTypes, cellSize, cols, rows } = ctx;
  const w = cols * cellSize;
  const h = rows * cellSize;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = false;

  c.fillStyle = ctx.paper;
  if (ctx.colorBlocks?.length) {
    drawColorBlocks(c, ctx.colorBlocks, cellSize);
  } else {
    c.fillRect(0, 0, w, h);
  }

  const typeMap = new Map(cellTypes.map((t) => [t.id, t]));
  const { stroke, strokeWidth } = resolveMeshStroke(typeMap);

  // 3D shape surface — subtle fill so line-based bands don't match the background
  if (ctx.generateMode === 'shapes3d') {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!grid[row][col].shadeBand) continue;
        c.fillStyle = ctx.surface;
        c.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  // Fills
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = resolveCellType(typeMap, cell);
      if (!type || type.mode !== 'fill') continue;
      const colors = resolveColors(type);
      const { x, y, w, h } = insetFillRect(col, row, cellSize, getFillInset(type));
      c.fillStyle = colors.fill;
      c.fillRect(x, y, w, h);
    }
  }

  // Mesh + blob outlines (deduplicated, single weight)
  const meshLines = collectMeshLines(grid, typeMap, cols, rows, cellSize, stroke, strokeWidth);
  drawSegments(c, meshLines);

  // Circles (vector-style: no white fill rect behind)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = resolveCellType(typeMap, cell);
      if (!type || type.mode !== 'circle') continue;
      const colors = resolveColors(type);
      const cellX = col * cellSize;
      const cellY = row * cellSize;
      const x = cellX + cellSize / 2;
      const y = cellY + cellSize / 2;
      const r = cellSize * type.circleRadius;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = colors.stroke;
      c.fill();
    }
  }

  // Hexagons
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = resolveCellType(typeMap, cell);
      if (!type || type.mode !== 'hexagon') continue;
      const colors = resolveColors(type);
      const cellX = col * cellSize;
      const cellY = row * cellSize;
      const x = cellX + cellSize / 2;
      const y = cellY + cellSize / 2;
      const r = cellSize * type.circleRadius;
      traceHexagonPath(c, x, y, r);
      c.fillStyle = colors.stroke;
      c.fill();
    }
  }

  // Other modes
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = resolveCellType(typeMap, cell);
      if (
        !type ||
        type.mode === 'fill' ||
        type.mode === 'circle' ||
        type.mode === 'hexagon' ||
        isMeshMode(type) ||
        type.mode === 'stroke'
      )
        continue;
      drawOtherMode(
        c,
        type,
        cell,
        col * cellSize,
        row * cellSize,
        cellSize,
        resolveColors(type),
        svgCache,
      );
    }
  }
}

function drawOtherMode(
  ctx: CanvasRenderingContext2D,
  type: CellTypeDef,
  cell: { typeId: string; logoMuted?: boolean },
  x: number,
  y: number,
  size: number,
  colors: ResolvedColors,
  svgCache: Map<string, HTMLImageElement>,
): void {
  const mode: RenderMode = type.mode;
  if (mode === 'svg' && type.svgSymbolId && type.svgMarkup) {
    const img = svgCache.get(type.svgSymbolId);
    if (img?.complete) {
      const scale =
        type.id === TYPE_IDS.logo
          ? getLogoSvgScale(type, cell.logoMuted)
          : getSvgScale(type);
      const { x: ox, y: oy, size: s } = scaledCellRect(size, scale);
      const dx = x + ox;
      const dy = y + oy;
      ctx.drawImage(img, dx, dy, s, s);
      const tint = type.colorApplication === 'fill' ? colors.fill : colors.stroke;
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = tint;
      ctx.fillRect(dx, dy, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }
  } else if (mode === 'stroke') {
    // Rendered via collectMeshLines.
  } else if (mode === 'crosshatch') {
    drawCrosshatchCell(ctx, x, y, size, type, colors.stroke);
  }
}

export function renderCellPreview(
  canvas: HTMLCanvasElement,
  type: CellTypeDef,
  size = 32,
): void {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, size, size);
  const colors = resolveColors(type);
  if (type.mode === 'circle') {
    c.beginPath();
    c.arc(size / 2, size / 2, size * type.circleRadius, 0, Math.PI * 2);
    c.fillStyle = colors.stroke;
    c.fill();
  } else if (type.mode === 'hexagon') {
    traceHexagonPath(c, size / 2, size / 2, size * type.circleRadius);
    c.fillStyle = colors.stroke;
    c.fill();
  } else if (type.mode === 'fill') {
    const m = size * getFillInset(type);
    c.fillStyle = colors.fill;
    c.fillRect(m, m, size - 2 * m, size - 2 * m);
  } else if (type.mode === 'mesh') {
    c.strokeStyle = colors.stroke;
    c.lineWidth = type.strokeWidth;
    c.strokeRect(0.5, 0.5, size - 1, size - 1);
  } else if (type.mode === 'stroke') {
    c.strokeStyle = colors.stroke;
    c.lineWidth = type.strokeWidth;
    c.strokeRect(0.5, 0.5, size - 1, size - 1);
  } else if (type.mode === 'crosshatch') {
    drawCrosshatchCell(c, 0, 0, size, type, colors.stroke);
  } else if (type.mode === 'svg' && type.svgSymbolId) {
    const img = getSvgCache().get(type.svgSymbolId);
    if (img?.complete) {
      const { x: ox, y: oy, size: s } = scaledCellRect(size, getSvgScale(type));
      c.drawImage(img, ox, oy, s, s);
    }
  }
}

export function buildSvgMarkup(ctx: RenderContext): string {
  const { grid, cellTypes, cellSize, cols, rows } = ctx;
  const w = cols * cellSize;
  const h = rows * cellSize;
  const typeMap = new Map(cellTypes.map((t) => [t.id, t]));
  const { stroke, strokeWidth } = resolveMeshStroke(typeMap);

  let fills = '';
  let circles = '';
  let hexagons = '';
  let hatches = '';
  let symbols = '';

  for (const type of cellTypes) {
    if (type.mode !== 'svg' || !type.svgSymbolId) continue;
    const markup = svgMarkupForType(type);
    if (!markup) continue;
    const vb = svgViewBoxForType(type);
    symbols += `<symbol id="${type.svgSymbolId}" viewBox="${vb}">${markup}</symbol>`;
  }

  let svgUses = '';
  let shapeSurface = '';

  if (ctx.generateMode === 'shapes3d') {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = grid[row][col];
        const x = col * cellSize;
        const y = row * cellSize;
        if (cell.shadeBand) {
          shapeSurface += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${ctx.surface}"/>`;
        }
      }
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = resolveCellType(typeMap, cell);
      if (!type) continue;
      const colors = resolveColors(type);
      const x = col * cellSize;
      const y = row * cellSize;

      if (type.mode === 'fill') {
        const { x, y, w, h } = insetFillRect(col, row, cellSize, getFillInset(type));
        fills += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors.fill}"/>`;
      } else if (type.mode === 'circle') {
        const r = cellSize * type.circleRadius;
        circles += `<circle cx="${x + cellSize / 2}" cy="${y + cellSize / 2}" r="${r}" fill="${colors.stroke}"/>`;
      } else if (type.mode === 'hexagon') {
        const r = cellSize * type.circleRadius;
        const cx = x + cellSize / 2;
        const cy = y + cellSize / 2;
        hexagons += `<polygon points="${hexagonSvgPoints(cx, cy, r)}" fill="${colors.stroke}"/>`;
      } else if (type.mode === 'svg' && type.svgSymbolId) {
        const scale =
          type.id === TYPE_IDS.logo
            ? getLogoSvgScale(type, cell.logoMuted)
            : getSvgScale(type);
        svgUses += svgSymbolInstance(col, row, cellSize, type, colors.stroke, scale);
      } else if (type.mode === 'crosshatch') {
        hatches += crosshatchCellToSvg(col, row, cellSize, type, colors.stroke);
      }
    }
  }

  const meshLines = collectMeshLines(grid, typeMap, cols, rows, cellSize, stroke, strokeWidth);
  const lines = segmentsToSvgLines(meshLines);

  const colorBlockLayer = ctx.colorBlocks?.length
    ? `<g id="color-blocks">${colorBlocksSvg(ctx.colorBlocks, cellSize)}</g>`
    : '';
  const backgroundLayer = colorBlockLayer || `<rect width="100%" height="100%" fill="${ctx.paper}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="geometricPrecision">
  ${backgroundLayer}
  ${symbols ? `<defs>${symbols}</defs>` : ''}
  ${shapeSurface ? `<g id="shape-surface">${shapeSurface}</g>` : ''}
  ${fills ? `<g id="fills">${fills}</g>` : ''}
  ${lines ? `<g id="lines" fill="none">${lines}</g>` : ''}
  ${circles ? `<g id="circles">${circles}</g>` : ''}
  ${hexagons ? `<g id="hexagons">${hexagons}</g>` : ''}
  ${hatches ? `<g id="hatches" fill="none">${hatches}</g>` : ''}
  ${svgUses ? `<g id="symbols">${svgUses}</g>` : ''}
</svg>`;
}

export function renderToSvg(container: HTMLElement, ctx: RenderContext): void {
  container.innerHTML = buildSvgMarkup(ctx);
  const svg = container.querySelector('svg');
  if (svg) {
    svg.setAttribute('shape-rendering', 'geometricPrecision');
  }
}

export function downloadSvg(ctx: RenderContext, seed: string): void {
  const svg = buildSvgMarkup(ctx);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pattern-${seed.replace(/[^a-z0-9-_]/gi, '-')}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rasterize the same SVG used for preview — guarantees export matches on-screen output. */
export function rasterizeContextToCanvas(
  canvas: HTMLCanvasElement,
  ctx: RenderContext,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): Promise<void> {
  const w = ctx.cols * ctx.cellSize;
  const h = ctx.rows * ctx.cellSize;
  const svg = buildSvgMarkup(ctx);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const pixelW = Math.max(1, Math.round(w * dpr));
        const pixelH = Math.max(1, Math.round(h * dpr));
        canvas.width = pixelW;
        canvas.height = pixelH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const c = canvas.getContext('2d');
        if (!c) throw new Error('Canvas 2D context unavailable');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, pixelW, pixelH);
        c.drawImage(img, 0, 0, pixelW, pixelH);
        URL.revokeObjectURL(url);
        resolve();
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize SVG frame'));
    };
    img.src = url;
  });
}
