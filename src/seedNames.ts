const ADJECTIVES = [
  'dusk', 'neon', 'quiet', 'brine', 'amber', 'frost', 'velvet', 'rust',
  'pale', 'vivid', 'hollow', 'sharp', 'mist', 'ember', 'slate', 'coral',
  'moss', 'ion', 'lunar', 'grain', 'silk', 'oxide', 'tidal', 'bloom',
] as const;

const NOUNS = [
  'zone', 'grid', 'drift', 'field', 'vault', 'ridge', 'pulse', 'kiln',
  'fold', 'arc', 'mesh', 'well', 'coil', 'dune', 'rift', 'knot',
  'haze', 'dock', 'spool', 'gleam', 'notch', 'flare', 'wisp', 'core',
] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Short seed like `dusk-zone-250`. */
export function randomSeedName(): string {
  const n = 100 + Math.floor(Math.random() * 900);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}
