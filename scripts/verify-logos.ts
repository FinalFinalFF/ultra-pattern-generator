import { generateGrid } from '../src/generate.ts';
import { getDefaultCellTypes } from '../src/cellTypes.ts';
import { defaultShapeNoise } from '../src/state.ts';
import { TYPE_IDS } from '../src/types.ts';

const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function foundationGroup(id: string): string | null {
  if (id === TYPE_IDS.logo) return null;
  if (id === TYPE_IDS.empty) return 'void';
  if (id === TYPE_IDS.solid) return 'solid';
  if (id === TYPE_IDS.dot) return 'dot';
  if (id === TYPE_IDS.grid || id === TYPE_IDS.crosshatch || id === TYPE_IDS.outline) return 'grid';
  return null;
}

function verifyLogos(
  grid: ReturnType<typeof generateGrid>,
  cols: number,
  rows: number,
): { logos: number; invalid: number; uncoveredEdges: number; thickEdges: number; gridCells: number } {
  let logos = 0;
  let invalid = 0;
  let uncoveredEdges = 0;
  let thickEdges = 0;
  let gridCells = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = grid[row][col].typeId;
      if (id === TYPE_IDS.grid) gridCells++;
      if (id !== TYPE_IDS.logo) continue;
      logos++;

      const left = col > 0 ? foundationGroup(grid[row][col - 1].typeId) : null;
      const right = col + 1 < cols ? foundationGroup(grid[row][col + 1].typeId) : null;
      const up = row > 0 ? foundationGroup(grid[row - 1][col].typeId) : null;
      const down = row + 1 < rows ? foundationGroup(grid[row + 1][col].typeId) : null;

      const horiz = left && right && left !== right;
      const vert = up && down && up !== down;
      if (!horiz && !vert) invalid++;
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      for (const [dc, dr] of CARDINAL) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (nc < col || (nc === col && nr <= row)) continue;

        const g1 = foundationGroup(grid[row][col].typeId);
        const g2 = foundationGroup(grid[nr][nc].typeId);
        if (!g1 || !g2 || g1 === g2) continue;

        const id1 = grid[row][col].typeId;
        const id2 = grid[nr][nc].typeId;
        const covered = id1 === TYPE_IDS.logo || id2 === TYPE_IDS.logo;
        if (!covered) uncoveredEdges++;
        if (id1 === TYPE_IDS.logo && id2 === TYPE_IDS.logo) thickEdges++;
      }
    }
  }

  return { logos, invalid, uncoveredEdges, thickEdges, gridCells };
}

const baseCtx = {
  seed: 'pattern-2024',
  cols: 60,
  rows: 34,
  generateMode: 'pattern' as const,
  cellTypes: getDefaultCellTypes(),
  shapeNoise: defaultShapeNoise,
  shape3d: { kind: 'sphere' as const, position: { x: 0, y: 0, z: 0 }, scale: 1.15, rotationY: 25 },
  animation: { enabled: false, speed: 0.025 },
  time: 0,
};

const grid = generateGrid(baseCtx);
const result = verifyLogos(grid, baseCtx.cols, baseCtx.rows);

console.log('Unified border accent pipeline:');
console.log(`  Grid cells (interior preserved): ${result.gridCells}`);
console.log(`  Logo count: ${result.logos}`);
console.log(`  Logos without opposing foundation sandwich: ${result.invalid}`);
console.log(`  Uncovered foundation edges: ${result.uncoveredEdges}`);
console.log(`  Edges with logo on both sides: ${result.thickEdges}`);

if (
  result.invalid > 0 ||
  result.logos === 0 ||
  result.uncoveredEdges > 0 ||
  result.thickEdges > 0 ||
  result.gridCells < 100
) {
  process.exit(1);
}
