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
const failures: { seed: string; rate: string }[] = [];

for (const seed of seeds) {
  const rate = measureHitRate(seed, defaultShape3d, defaultShape3dMapping);
  min = Math.min(min, rate);
  if (rate < 0.4) failures.push({ seed, rate: `${(rate * 100).toFixed(1)}%` });
}

// Thin shapes (cone, capsule, disc, …) cover less of the grid by design, so
// per-kind rates are reported but only a zero-hit kind fails the check.
const kindRates = kinds.map((kind) => ({
  kind,
  rate: measureHitRate('pattern-2024', { ...defaultShape3d, kind }, defaultShape3dMapping),
}));
const emptyKinds = kindRates.filter((k) => k.rate < 0.01).map((k) => k.kind);

console.log(`Grid: ${SHAPES3D_COLS}x${SHAPES3D_ROWS}`);
console.log(`Default shape, min hit rate across ${seeds.length} seeds: ${(min * 100).toFixed(1)}%`);
console.log(`Seeds under 40%: ${failures.length}`);
if (failures.length) console.log(failures.slice(0, 8));
for (const { kind, rate } of kindRates) {
  console.log(`  ${kind.padEnd(10)} ${(rate * 100).toFixed(1)}%`);
}

if (failures.length || emptyKinds.length) {
  if (emptyKinds.length) console.log(`Kinds with no hits: ${emptyKinds.join(', ')}`);
  process.exit(1);
}
console.log('ok');
