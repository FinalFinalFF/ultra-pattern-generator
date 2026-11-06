import { generateColorShapes } from '../src/colorBlocks.ts';

const SEEDS = ['pattern-2024', 'live-sync-930', 'alpha', 'bravo-17', 'charlie-xyz', ...Array.from({ length: 15 }, (_, i) => `s-${i}`)];
const SIZES: [number, number][] = [[60, 34], [72, 72], [10, 10], [24, 60], [120, 68]];
const MIN_SPAN = 4;

const failures: string[] = [];
const share = new Map<string, number>();
let cells = 0;
let shapesTotal = 0;
let slowest = 0;

for (const [cols, rows] of SIZES) {
  for (const seed of SEEDS) {
    const t0 = performance.now();
    const runs = generateColorShapes(seed, cols, rows);
    slowest = Math.max(slowest, performance.now() - t0);
    const grid = Array.from({ length: rows }, () => new Array<string>(cols).fill(''));
    const shapes = new Set<number>();
    for (const run of runs) {
      shapes.add(run.shape!);
      for (let c = run.col; c < run.col + run.cols; c++) {
        if (grid[run.row]![c]) failures.push(`${seed} ${cols}x${rows}: overlap at ${c},${run.row}`);
        grid[run.row]![c] = run.color;
      }
    }
    shapesTotal += shapes.size;
    const span = Math.min(MIN_SPAN, cols, rows);
    let thin = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const v = grid[row]![col]!;
        if (!v) failures.push(`${seed} ${cols}x${rows}: gap at ${col},${row}`);
        share.set(v, (share.get(v) ?? 0) + 1);
        cells++;
        let h = 1;
        for (let c = col + 1; grid[row]![c] === v; c++) h++;
        for (let c = col - 1; grid[row]![c] === v; c--) h++;
        let w = 1;
        for (let r = row + 1; grid[r]?.[col] === v; r++) w++;
        for (let r = row - 1; grid[r]?.[col] === v; r--) w++;
        if (h < span || w < span) thin++;
      }
    }
    if (thin) failures.push(`${seed} ${cols}x${rows}: ${thin} cells in strips under ${span} wide`);
  }
}

console.log('Color shapes:');
console.log(`  avg shapes per canvas: ${(shapesTotal / (SIZES.length * SEEDS.length)).toFixed(1)}, slowest: ${slowest.toFixed(1)} ms`);
for (const [color, n] of share) console.log(`  ${color} ${((n / cells) * 100).toFixed(1)}%`);
if (failures.length) {
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  console.error(`  ${failures.length} failures`);
  process.exit(1);
}
console.log('ok');
