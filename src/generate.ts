import { applyAdjacencyPostProcess } from './adjacency';
import { classifyNoise, getNoiseAssignableTypes } from './cellTypes';
import { hashSeed, sampleNoise, SimplexNoise } from './noise';
import type { GeneratorContext, GridCell } from './types';

export function generateGrid(ctx: GeneratorContext): GridCell[][] {
  const shapeSeed = hashSeed(ctx.seed);
  const colorSeed = hashSeed(`${ctx.seed}-color-${ctx.colorNoise.seedOffset}`);
  const shapeNoise = new SimplexNoise(shapeSeed);
  const colorNoiseGen = new SimplexNoise(colorSeed);

  const globalTime = ctx.time * ctx.animation.speed;
  const colorTime = globalTime + ctx.animation.colorDrift;

  const noiseTypes = getNoiseAssignableTypes(ctx.cellTypes);

  const grid: GridCell[][] = [];

  for (let row = 0; row < ctx.rows; row++) {
    const rowCells: GridCell[] = [];
    for (let col = 0; col < ctx.cols; col++) {
      const shapeN = sampleNoise(shapeNoise, col, row, globalTime, ctx.shapeNoise);
      const typeId = classifyNoise(shapeN, noiseTypes);

      let colorId: string | null = null;
      if (ctx.colorNoise.enabled) {
        const colorN = sampleNoise(
          colorNoiseGen,
          col,
          row,
          colorTime,
          ctx.colorNoise,
          ctx.colorNoise.seedOffset * 0.01,
        );
        colorId = classifyNoise(colorN, ctx.activeScheme.colors);
      }

      rowCells.push({ typeId, colorId });
    }
    grid.push(rowCells);
  }

  return applyAdjacencyPostProcess(
    grid,
    ctx.cellTypes,
    ctx.cols,
    ctx.rows,
    ctx.adjacency,
  );
}
