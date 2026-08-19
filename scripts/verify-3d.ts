import { defaultShape3d } from '../src/state.ts';
import { defaultShape3dMapping } from '../src/shapes3dMapping.ts';
import { measureHitRate, SHAPES3D_COLS, SHAPES3D_ROWS } from '../src/shapes3d.ts';
import type { Shape3dKind } from '../src/types.ts';

const seeds = [
  'pattern-2024',
  ...Array.from({ length: 19 }, (_, i) => `pattern-${1000 + i}`),
];
const kinds: Shape3dKind[] = [
  'sphere',
  'box',
  'torus',
  'ring',
  'ringArc',
  'disc',
  'capsule',
  'cone',
  'cylinder',
];

let min = 1;
const failures: { seed: string; kind?: Shape3dKind; rate: string }[] = [];

for (const seed of seeds) {
  const rate = measureHitRate(seed, defaultShape3d, defaultShape3dMapping);
  min = Math.min(min, rate);
  if (rate < 0.4) failures.push({ seed, rate: `${(rate * 100).toFixed(1)}%` });
}

for (const kind of kinds) {
  const rate = measureHitRate('pattern-2024', { ...defaultShape3d, kind }, defaultShape3dMapping);
  min = Math.min(min, rate);
  if (rate < 0.4) failures.push({ kind, rate: `${(rate * 100).toFixed(1)}%` });
}

console.log(`Grid: ${SHAPES3D_COLS}x${SHAPES3D_ROWS}`);
console.log(`Min hit rate: ${(min * 100).toFixed(1)}%`);
console.log(`Failures (<40%): ${failures.length}`);
if (failures.length) console.log(failures.slice(0, 8));

const zeroSeeds = seeds.filter(
  (seed) => measureHitRate(seed, defaultShape3d, defaultShape3dMapping) < 0.01,
);
console.log(`Zero-hit seeds: ${zeroSeeds.length}`, zeroSeeds);
