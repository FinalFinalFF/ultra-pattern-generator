import { getColorById } from './colorSchemes';
import { isMeshMode } from './cellTypes';
import type {
  CellTypeDef,
  ColorDef,
  GridCell,
  RenderContext,
  RenderMode,
  ResolvedColors,
} from './types';

export function autoContrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export function resolveColors(
  type: CellTypeDef,
  color: ColorDef | null,
): ResolvedColors {
  if (!color) return { fill: type.fill, stroke: type.stroke };

  switch (type.colorApplication) {
    case 'fill':
      return { fill: color.hex, stroke: type.stroke };
    case 'stroke':
      return { fill: type.fill, stroke: color.hex };
    case 'both':
      return { fill: color.hex, stroke: color.hex };
    case 'accent':
      return { fill: color.hex, stroke: autoContrast(color.hex) };
    default:
      return { fill: type.fill, stroke: type.stroke };
  }
}

function drawHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  spacing: number,
  angle: number,
  stroke: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const diag = size * 2;
  for (let d = -diag; d < diag; d += spacing) {
    ctx.beginPath();
    const x1 = x + d * cos;
    const y1 = y + d * sin;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + diag * sin, y1 + diag * cos);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMeshCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cell: GridCell,
  type: CellTypeDef,
  colors: ResolvedColors,
): void {
  const edges = cell.edges ?? { top: true, right: true, bottom: true, left: true };
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = type.strokeWidth;
  ctx.lineCap = 'square';

  if (edges.top) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.stroke();
  }
  if (edges.right) {
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.lineTo(x + size, y + size);
    ctx.stroke();
  }
  if (edges.bottom) {
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.stroke();
  }
  if (edges.left) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
}

function drawCellMode(
  ctx: CanvasRenderingContext2D,
  type: CellTypeDef,
  cell: GridCell,
  x: number,
  y: number,
  size: number,
  colors: ResolvedColors,
  svgCache: Map<string, HTMLImageElement>,
): void {
  const mode: RenderMode = type.mode;

  switch (mode) {
    case 'none':
      return;
    case 'mesh':
      drawMeshCell(ctx, x, y, size, cell, type, colors);
      return;
    case 'fill':
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, size, size);
      return;
    case 'stroke':
      drawMeshCell(ctx, x, y, size, cell, type, colors);
      return;
    case 'circle': {
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, size, size);
      const r = size * type.circleRadius;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.stroke;
      ctx.fill();
      return;
    }
    case 'crosshatch':
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, size, size);
      drawHatch(ctx, x, y, size, type.hatchSpacing, type.hatchAngle, colors.stroke);
      drawHatch(ctx, x, y, size, type.hatchSpacing, type.hatchAngle + 90, colors.stroke);
      return;
    case 'diagonal':
      ctx.fillStyle = colors.fill;
      ctx.fillRect(x, y, size, size);
      drawHatch(ctx, x, y, size, type.hatchSpacing, type.hatchAngle, colors.stroke);
      return;
    case 'svg': {
      if (!type.svgSymbolId || !type.svgMarkup) return;
      const img = svgCache.get(type.svgSymbolId);
      if (img?.complete) {
        ctx.drawImage(img, x, y, size, size);
      }
      return;
    }
  }
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  ctx: RenderContext,
  svgCache: Map<string, HTMLImageElement>,
): void {
  const { grid, cellTypes, activeScheme, colorNoiseEnabled, cellSize, cols, rows } = ctx;
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const c = canvas.getContext('2d');
  if (!c) return;

  c.fillStyle = activeScheme.backgroundColor;
  c.fillRect(0, 0, canvas.width, canvas.height);

  const typeMap = new Map(cellTypes.map((t) => [t.id, t]));

  // Pass 1: fills (solid cells)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = typeMap.get(cell.typeId);
      if (!type || type.mode !== 'fill') continue;
      const colorDef = colorNoiseEnabled ? getColorById(activeScheme, cell.colorId) : null;
      const colors = resolveColors(type, colorDef);
      c.fillStyle = colors.fill;
      c.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  // Pass 2: mesh lines (flush on cell boundaries)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = typeMap.get(cell.typeId);
      if (!type || !isMeshMode(type)) continue;
      const colorDef = colorNoiseEnabled ? getColorById(activeScheme, cell.colorId) : null;
      const colors = resolveColors(type, colorDef);
      drawMeshCell(c, col * cellSize, row * cellSize, cellSize, cell, type, colors);
    }
  }

  // Pass 3: circles (dots and halos)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = typeMap.get(cell.typeId);
      if (!type || type.mode !== 'circle') continue;
      const colorDef = colorNoiseEnabled ? getColorById(activeScheme, cell.colorId) : null;
      const colors = resolveColors(type, colorDef);
      const x = col * cellSize;
      const y = row * cellSize;
      c.fillStyle = colors.fill;
      c.fillRect(x, y, cellSize, cellSize);
      const r = cellSize * type.circleRadius;
      c.beginPath();
      c.arc(x + cellSize / 2, y + cellSize / 2, r, 0, Math.PI * 2);
      c.fillStyle = colors.stroke;
      c.fill();
    }
  }

  // Pass 4: other modes (crosshatch, diagonal, svg)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = typeMap.get(cell.typeId);
      if (!type) continue;
      if (type.mode === 'fill' || type.mode === 'circle' || isMeshMode(type)) continue;
      const colorDef = colorNoiseEnabled ? getColorById(activeScheme, cell.colorId) : null;
      const colors = resolveColors(type, colorDef);
      drawCellMode(c, type, cell, col * cellSize, row * cellSize, cellSize, colors, svgCache);
    }
  }
}

export function renderCellPreview(
  canvas: HTMLCanvasElement,
  type: CellTypeDef,
  size = 32,
): void {
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, size, size);
  const colors = resolveColors(type, null);
  const cell: GridCell = {
    typeId: type.id,
    colorId: null,
    edges: { top: true, right: true, bottom: true, left: true },
  };
  drawCellMode(c, type, cell, 0, 0, size, colors, new Map());
}

export function getCellTypeMap(types: CellTypeDef[]): Map<string, CellTypeDef> {
  return new Map(types.map((t) => [t.id, t]));
}

export function collectCellsByType(grid: GridCell[][]): Map<string, { col: number; row: number; cell: GridCell }[]> {
  const map = new Map<string, { col: number; row: number; cell: GridCell }[]>();
  grid.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      const list = map.get(cell.typeId) ?? [];
      list.push({ col: colIdx, row: rowIdx, cell });
      map.set(cell.typeId, list);
    });
  });
  return map;
}
