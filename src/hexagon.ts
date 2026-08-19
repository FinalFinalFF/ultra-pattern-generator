/** Pointy-top regular hexagon vertices (circumradius r). */
export function hexagonVertices(cx: number, cy: number, r: number): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    verts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return verts;
}

export function traceHexagonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const verts = hexagonVertices(cx, cy, r);
  ctx.beginPath();
  ctx.moveTo(verts[0][0], verts[0][1]);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(verts[i][0], verts[i][1]);
  }
  ctx.closePath();
}

export function hexagonSvgPoints(cx: number, cy: number, r: number): string {
  return hexagonVertices(cx, cy, r)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}
