import { generateGrid } from '../src/generate.ts';
import { getDefaultCellTypes } from '../src/cellTypes.ts';
import { defaultShapeNoise } from '../src/state.ts';
import { TYPE_IDS } from '../src/types.ts';
import type { CellTypeDef, GeneratorContext, GridCell } from '../src/types.ts';

/**
 * Checks the rules `accentPlacement.ts` applies to logo (star) cells:
 *  - stars only replace cells; every other cell keeps its region type
 *  - every star sits on a region edge where one side is grid or empty
 *  - no two stars face each other across the same edge
 *  - at density 1 every such edge gets exactly one star; at density 0, none
 */

const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const SEEDS = ['pattern-2024', 'live-sync-930', 'alpha', 'bravo-17', 'charlie-xyz'];

type Grid = GridCell[][];

function region(id: string): string | null {
  if (id === TYPE_IDS.empty) return 'void';
  if (id === TYPE_IDS.solid) return 'solid';
  if (id === TYPE_IDS.dot) return 'dot';
  if (id === TYPE_IDS.hexagon) return 'hex';
  if (id === TYPE_IDS.grid) return 'grid';
  return null;
}

const isLight = (g: string) => g === 'grid' || g === 'void';

function withLogo(enabled: boolean, density?: number): CellTypeDef[] {
  return getDefaultCellTypes().map((t) =>
    t.id === TYPE_IDS.logo ? { ...t, enabled, density: density ?? t.density } : t,
  );
}

function ctxFor(seed: string, cellTypes: CellTypeDef[]): GeneratorContext {
  return {
    seed,
    cols: 60,
    rows: 34,
    generateMode: 'pattern',
    cellTypes,
    shapeNoise: defaultShapeNoise,
    shape3d: { kind: 'sphere', position: { x: 0, y: 0, z: 0 }, scale: 1.15, rotationX: 0, rotationY: 25 },
    animation: { enabled: false, speed: 0.025 },
    time: 0,
  } as GeneratorContext;
}

/** Each unordered pair of neighboring cells in different regions, once. */
function* regionEdges(base: Grid) {
  const rows = base.length;
  const cols = base[0].length;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      for (const [dc, dr] of CARDINAL) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (nc < col || (nc === col && nr <= row)) continue;
        const g1 = region(base[row][col].typeId);
        const g2 = region(base[nr][nc].typeId);
        if (!g1 || !g2 || g1 === g2) continue;
        yield { a: [col, row] as const, b: [nc, nr] as const, g1, g2 };
      }
    }
  }
}

function onEligibleEdge(base: Grid, col: number, row: number): boolean {
  const g = region(base[row][col].typeId);
  if (!g) return false;
  for (const [dc, dr] of CARDINAL) {
    const ng = region(base[row + dr]?.[col + dc]?.typeId ?? '');
    if (ng && ng !== g && (isLight(g) || isLight(ng))) return true;
  }
  return false;
}

function check(seed: string): string[] {
  const errors: string[] = [];
  const base = generateGrid(ctxFor(seed, withLogo(false)));
  const grid = generateGrid(ctxFor(seed, withLogo(true)));
  const full = generateGrid(ctxFor(seed, withLogo(true, 1)));
  const none = generateGrid(ctxFor(seed, withLogo(true, 0)));
  const isLogo = (g: Grid, c: number, r: number) => g[r][c].typeId === TYPE_IDS.logo;

  let logos = 0;
  let gridCells = 0;
  for (let row = 0; row < base.length; row++) {
    for (let col = 0; col < base[0].length; col++) {
      const id = grid[row][col].typeId;
      if (id === TYPE_IDS.grid) gridCells++;
      if (id !== TYPE_IDS.logo) {
        if (id !== base[row][col].typeId) errors.push(`cell ${col},${row} changed without becoming a star`);
        continue;
      }
      logos++;
      if (!onEligibleEdge(base, col, row)) errors.push(`star at ${col},${row} is not on a grid/empty edge`);
    }
  }

  let facing = 0;
  let bare = 0;
  for (const { a, b, g1, g2 } of regionEdges(base)) {
    if (isLogo(grid, ...a) && isLogo(grid, ...b)) facing++;
    const eligible = isLight(g1) || isLight(g2);
    if (!eligible) continue;
    const stars = +isLogo(full, ...a) + +isLogo(full, ...b);
    if (stars === 2) errors.push(`stars on both sides of ${a} | ${b} at 100% density`);
    if (stars === 0) bare++;
  }
  if (facing) errors.push(`${facing} edges have stars on both sides`);
  if (bare) errors.push(`${bare} edges have no star at 100% density`);
  if (none.some((r) => r.some((c) => c.typeId === TYPE_IDS.logo))) errors.push('stars appear at 0% density');
  if (logos === 0) errors.push('no stars placed');
  if (gridCells < 100) errors.push(`only ${gridCells} grid cells survived`);

  console.log(`  ${seed.padEnd(14)} stars=${String(logos).padStart(4)}  grid=${gridCells}  ${errors.length ? 'FAIL' : 'ok'}`);
  return errors;
}

console.log('Logo (star) placement:');
const failures = SEEDS.flatMap((seed) => check(seed).map((e) => `${seed}: ${e}`));
if (failures.length) {
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
