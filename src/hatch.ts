import type { CellTypeDef } from './types';

export function drawHatchLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
  angleDeg: number,
  stroke: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  const angle = (angleDeg * Math.PI) / 180;
  const diag = Math.hypot(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  for (let i = -diag; i <= diag; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, -diag);
    ctx.lineTo(i, diag);
    ctx.stroke();
  }
  ctx.restore();
}

function hatchLineElements(
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
  angleDeg: number,
  stroke: string,
  strokeWidth: number,
): string {
  const angle = (angleDeg * Math.PI) / 180;
  const diag = Math.hypot(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let lines = '';
  for (let i = -diag; i <= diag; i += spacing) {
    const x1 = cx + i * cos - diag * sin;
    const y1 = cy + i * sin + diag * cos;
    const x2 = cx + i * cos + diag * sin;
    const y2 = cy + i * sin - diag * cos;
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }
  return lines;
}

export function drawOutlineSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: CellTypeDef,
  stroke: string,
): void {
  const inset = (size * (1 - type.circleRadius)) / 2;
  const s = size - inset * 2;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = type.strokeWidth;
  ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, s - 1, s - 1);
}

export function outlineSquareToSvg(
  col: number,
  row: number,
  cellSize: number,
  type: CellTypeDef,
  stroke: string,
): string {
  const x = col * cellSize;
  const y = row * cellSize;
  const inset = (cellSize * (1 - type.circleRadius)) / 2;
  const s = cellSize - inset * 2;
  return `<rect x="${x + inset}" y="${y + inset}" width="${s}" height="${s}" fill="none" stroke="${stroke}" stroke-width="${type.strokeWidth}"/>`;
}

export function drawCrosshatchCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: CellTypeDef,
  stroke: string,
): void {
  const m = size * (type.fillInset ?? 0.06);
  const ix = x + m;
  const iy = y + m;
  const w = size - 2 * m;
  const h = size - 2 * m;
  const spacing = type.hatchSpacing ?? 4;
  const angle = type.hatchAngle ?? 45;
  drawHatchLines(ctx, ix, iy, w, h, spacing, angle, stroke, type.strokeWidth);
  drawHatchLines(ctx, ix, iy, w, h, spacing, angle + 90, stroke, type.strokeWidth);
}

export function crosshatchCellToSvg(
  col: number,
  row: number,
  cellSize: number,
  type: CellTypeDef,
  stroke: string,
): string {
  const x = col * cellSize;
  const y = row * cellSize;
  const m = cellSize * (type.fillInset ?? 0.06);
  const w = cellSize - 2 * m;
  const h = cellSize - 2 * m;
  const clipId = `hatch-${col}-${row}`;
  const spacing = type.hatchSpacing ?? 4;
  const angle = type.hatchAngle ?? 45;
  const lines =
    hatchLineElements(x + m, y + m, w, h, spacing, angle, stroke, type.strokeWidth) +
    hatchLineElements(x + m, y + m, w, h, spacing, angle + 90, stroke, type.strokeWidth);
  return `<clipPath id="${clipId}"><rect x="${x + m}" y="${y + m}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${clipId})">${lines}</g>`;
}
