import { applyAccentPlacement } from './accentPlacement';
import { getAnimationPhase } from './animation';
import { applyAdjacencyPostProcess } from './adjacency';
import { assignGradient, enforceGradientLayers } from './gradientMode';
import { resolveGradientMapping } from './gradientMapping';
import { assignShapeTypesNoise } from './shapeZones';
import { assignShapes3d } from './shapes3d';
import { resolveShape3dMapping } from './shapes3dMapping';
import { hashSeed, SimplexNoise } from './noise';
import type { GeneratorContext, GridCell } from './types';

export function generateGrid(ctx: GeneratorContext): GridCell[][] {
  const phase = getAnimationPhase(ctx.time, ctx.animation);

  if (ctx.generateMode === 'shapes3d') {
    const mapping = resolveShape3dMapping(ctx.cellTypes);
    return assignShapes3d(ctx.seed, ctx.shape3d, mapping);
  }

  if (ctx.generateMode === 'gradient') {
    const mapping = resolveGradientMapping(ctx.cellTypes);
    let grid = assignGradient(ctx.seed, ctx.cols, ctx.rows, mapping);
    grid = enforceGradientLayers(grid, mapping, ctx.cols, ctx.rows);
    return applyAdjacencyPostProcess(grid, ctx.cellTypes);
  }

  const shapeSeed = hashSeed(ctx.seed);
  const shapeNoise = new SimplexNoise(shapeSeed);
  const typeGrid = assignShapeTypesNoise(
    shapeNoise,
    ctx.cols,
    ctx.rows,
    phase,
    ctx.shapeNoise,
    ctx.cellTypes,
    ctx.animation,
  );

  let grid = typeGrid.map((row) => row.map((typeId) => ({ typeId })));

  let result = applyAdjacencyPostProcess(
    grid,
    ctx.cellTypes,
  );

  result = applyAccentPlacement(
    result,
    ctx.cellTypes,
    ctx.cols,
    ctx.rows,
    ctx.seed,
    phase,
  );

  return result;
}
