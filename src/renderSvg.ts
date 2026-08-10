import { getColorById } from './colorSchemes';
import { isMeshMode } from './cellTypes';
import { resolveColors } from './renderCanvas';
import type { CellTypeDef, GridCell, RenderContext, RenderMode } from './types';

function hatchLines(
  x: number,
  y: number,
  size: number,
  spacing: number,
  angle: number,
  stroke: string,
): string {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const clipId = `clip-${x}-${y}-${angle}`;
  let lines = '';
  const diag = size * 2;
  for (let d = -diag; d < diag; d += spacing) {
    const x1 = x + d * cos;
    const y1 = y + d * sin;
    lines += `<line x1="${x1}" y1="${y1}" x2="${x1 + diag * sin}" y2="${y1 + diag * cos}" stroke="${stroke}" stroke-width="1"/>`;
  }
  return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}"/></clipPath><g clip-path="url(#${clipId})">${lines}</g>`;
}

function meshCellSvg(
  type: CellTypeDef,
  cell: GridCell,
  x: number,
  y: number,
  size: number,
  stroke: string,
): string {
  const edges = cell.edges ?? { top: true, right: true, bottom: true, left: true };
  const sw = type.strokeWidth;
  let out = '';
  if (edges.top) {
    out += `<line x1="${x}" y1="${y}" x2="${x + size}" y2="${y}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  if (edges.right) {
    out += `<line x1="${x + size}" y1="${y}" x2="${x + size}" y2="${y + size}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  if (edges.bottom) {
    out += `<line x1="${x}" y1="${y + size}" x2="${x + size}" y2="${y + size}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  if (edges.left) {
    out += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + size}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  return out;
}

function cellSvg(
  type: CellTypeDef,
  cell: GridCell,
  x: number,
  y: number,
  size: number,
  colors: { fill: string; stroke: string },
): string {
  const mode: RenderMode = type.mode;
  switch (mode) {
    case 'none':
      return '';
    case 'mesh':
    case 'stroke':
      return meshCellSvg(type, cell, x, y, size, colors.stroke);
    case 'fill':
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${colors.fill}"/>`;
    case 'circle': {
      const r = size * type.circleRadius;
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${colors.fill}"/><circle cx="${x + size / 2}" cy="${y + size / 2}" r="${r}" fill="${colors.stroke}"/>`;
    }
    case 'crosshatch':
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${colors.fill}"/>${hatchLines(x, y, size, type.hatchSpacing, type.hatchAngle, colors.stroke)}${hatchLines(x, y, size, type.hatchSpacing, type.hatchAngle + 90, colors.stroke)}`;
    case 'diagonal':
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${colors.fill}"/>${hatchLines(x, y, size, type.hatchSpacing, type.hatchAngle, colors.stroke)}`;
    case 'svg':
      if (!type.svgSymbolId) return '';
      return `<use href="#${type.svgSymbolId}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
    default:
      return '';
  }
}

export function buildSvgString(ctx: RenderContext): string {
  const { grid, cellTypes, activeScheme, colorNoiseEnabled, cellSize, cols, rows } = ctx;
  const w = cols * cellSize;
  const h = rows * cellSize;
  const typeMap = new Map(cellTypes.map((t) => [t.id, t]));

  const defs: string[] = [];
  for (const type of cellTypes) {
    if (type.mode === 'svg' && type.svgSymbolId && type.svgMarkup) {
      defs.push(
        `<symbol id="${type.svgSymbolId}" viewBox="0 0 100 100">${type.svgMarkup}</symbol>`,
      );
    }
  }

  let fills = '';
  let mesh = '';
  let circles = '';
  let other = '';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const type = typeMap.get(cell.typeId);
      if (!type || type.mode === 'none') continue;
      const colorDef = colorNoiseEnabled ? getColorById(activeScheme, cell.colorId) : null;
      const colors = resolveColors(type, colorDef);
      const x = col * cellSize;
      const y = row * cellSize;

      if (type.mode === 'fill') {
        fills += cellSvg(type, cell, x, y, cellSize, colors);
      } else if (isMeshMode(type)) {
        mesh += cellSvg(type, cell, x, y, cellSize, colors);
      } else if (type.mode === 'circle') {
        circles += cellSvg(type, cell, x, y, cellSize, colors);
      } else {
        other += cellSvg(type, cell, x, y, cellSize, colors);
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="${activeScheme.backgroundColor}"/>
  ${defs.length ? `<defs>${defs.join('')}</defs>` : ''}
  ${fills ? `<g id="fills">${fills}</g>` : ''}
  ${mesh ? `<g id="mesh">${mesh}</g>` : ''}
  ${circles ? `<g id="circles">${circles}</g>` : ''}
  ${other ? `<g id="other">${other}</g>` : ''}
</svg>`;
}

export function downloadSvg(ctx: RenderContext, seed: string): void {
  const svg = buildSvgString(ctx);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pattern-${seed.replace(/[^a-z0-9-_]/gi, '-')}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
