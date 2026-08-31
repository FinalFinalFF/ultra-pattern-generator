const ADJECTIVES = [
  'ultra', 'agent', 'inline', 'live', 'wired', 'host', 'closed', 'traced',
  'scoped', 'keyed', 'signed', 'gated', 'synced', 'local', 'native', 'sealed',
  'proxy', 'mcp', 'blunt', 'runtime', 'attested', 'pinned', 'hashed', 'named',
] as const;

const NOUNS = [
  'wire', 'hub', 'proxy', 'agent', 'tool', 'guard', 'audit', 'policy',
  'trace', 'span', 'call', 'rule', 'sprawl', 'prompt', 'nonce', 'plane',
  'surface', 'fleet', 'sync', 'log', 'gate', 'stream', 'token', 'rail',
] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Short seed like `ultra-wire-204`. */
export function randomSeedName(): string {
  const n = 100 + Math.floor(Math.random() * 900);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}
