import type { CellTypeDef, ColorSchemeId } from './types';
import { TYPE_IDS } from './types';
import {
  BRAND,
  BRAND_ACCENTS,
  BRAND_FAMILIES,
  BRAND_INK_SHADES,
  BRAND_PAPERS,
  contrastRatio,
  mixHex,
  relativeLuminance,
  type BrandFamily,
  type BrandShade,
} from './brandColors';
import { colorBlocksSwatchStyle } from './colorBlocks';
import { hashSeed } from './noise';

export { BRAND } from './brandColors';

export interface ColorFieldPalette {
  paper: string;
  surface: string;
  /** Fallback ink for user-added types absent from `typeInk`. */
  ink: string;
  typeInk: Record<string, string>;
}

export interface ColorScheme {
  id: ColorSchemeId;
  name: string;
  paper: string;
  /** 3D shape surface tint (slightly off paper). */
  surface: string;
  ink: string;
  /** Per-type ink for multicolor schemes. */
  typeInk?: Partial<Record<string, string>>;
}


const PALETTE = {
  white: BRAND.white,
  black: BRAND.black,
  royal: '#4169E1',
  scarlet: '#E63939',
  hunter: '#2D5016',
  gold: '#D4A017',
  green: BRAND.green,
  blue: BRAND.blue,
  red: BRAND.red,
  pink: BRAND.pink,
} as const;

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'mono',
    name: 'Black on white',
    paper: PALETTE.white,
    surface: '#F0F0F0',
    ink: PALETTE.black,
  },
  {
    id: 'green-light-on-dark',
    name: 'Dark green on light green',
    paper: BRAND.green,
    surface: '#016538',
    ink: BRAND.greenDark,
  },
  {
    id: 'blue-light-on-dark',
    name: 'Dark blue on light blue',
    paper: BRAND.blue,
    surface: '#004A92',
    ink: BRAND.blueDark,
  },
  {
    id: 'red-light-on-dark',
    name: 'Dark red on light red',
    paper: BRAND.red,
    surface: '#9A250A',
    ink: BRAND.redDark,
  },
  {
    id: 'pink-light-on-dark',
    name: 'Dark pink on light pink',
    paper: BRAND.pink,
    surface: '#B0068F',
    ink: BRAND.pinkDark,
  },
  {
    id: 'color-blocks',
    name: 'Color blocks',
    paper: BRAND.white,
    surface: '#F0F0F0',
    ink: BRAND.black,
  },
  {
    id: 'random',
    name: 'Random',
    paper: '#F5E6A3',
    surface: '#EDE0A0',
    ink: PALETTE.black,
    typeInk: {
      [TYPE_IDS.grid]: PALETTE.blue,
      [TYPE_IDS.dot]: PALETTE.scarlet,
      [TYPE_IDS.hexagon]: PALETTE.hunter,
      [TYPE_IDS.solid]: PALETTE.green,
      [TYPE_IDS.crosshatch]: PALETTE.red,
      [TYPE_IDS.outline]: BRAND.blueDark,
      [TYPE_IDS.logo]: PALETTE.black,
      [TYPE_IDS.empty]: PALETTE.gold,
    },
  },
  {
    id: 'brand-random',
    name: 'Brand random',
    paper: BRAND.white,
    surface: '#F0F0F0',
    ink: BRAND.black,
    typeInk: {
      [TYPE_IDS.grid]: BRAND.blue,
      [TYPE_IDS.dot]: BRAND.pink,
      [TYPE_IDS.hexagon]: BRAND.green,
      [TYPE_IDS.solid]: BRAND.green,
      [TYPE_IDS.crosshatch]: BRAND.red,
      [TYPE_IDS.outline]: BRAND.blue,
      [TYPE_IDS.logo]: BRAND.pink,
      [TYPE_IDS.empty]: BRAND.red,
    },
  },
  {
    id: 'brand-pure',
    name: 'Brand pure',
    paper: BRAND.white,
    surface: '#F0F0F0',
    ink: BRAND.black,
    typeInk: {
      [TYPE_IDS.grid]: BRAND.green,
      [TYPE_IDS.dot]: BRAND.blue,
      [TYPE_IDS.hexagon]: BRAND.red,
      [TYPE_IDS.solid]: BRAND.pink,
      [TYPE_IDS.crosshatch]: BRAND.green,
      [TYPE_IDS.outline]: BRAND.blue,
      [TYPE_IDS.logo]: BRAND.red,
      [TYPE_IDS.empty]: BRAND.pink,
    },
  },
];

const SCHEME_BY_ID = new Map(COLOR_SCHEMES.map((s) => [s.id, s]));

const COLOR_FIELD_TYPES = [
  TYPE_IDS.grid,
  TYPE_IDS.dot,
  TYPE_IDS.hexagon,
  TYPE_IDS.solid,
  TYPE_IDS.crosshatch,
  TYPE_IDS.outline,
  TYPE_IDS.logo,
  TYPE_IDS.empty,
] as const;

function seededUnit(seed: string, key: string): number {
  return hashSeed(`${seed}:random:${key}`) / 0xffffffff;
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toByte = (v: number) => Math.round((v + m) * 255);
  const hex = (v: number) => toByte(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

/** Deterministic multicolor palette from a seed string. */
export function generateColorFieldPalette(seed: string): ColorFieldPalette {
  const baseHue = seededUnit(seed, 'base') * 360;
  const paperS = 0.5 + seededUnit(seed, 'paperS') * 0.35;
  const paperL = 0.72 + seededUnit(seed, 'paperL') * 0.18;
  const paper = hslToHex(baseHue, paperS, paperL);
  const surface = hslToHex(baseHue, paperS * 0.85, paperL - 0.07);

  const typeInk: Record<string, string> = {};
  for (let i = 0; i < COLOR_FIELD_TYPES.length; i++) {
    const typeId = COLOR_FIELD_TYPES[i];
    const hue =
      (baseHue + i * 47 + seededUnit(seed, `${typeId}:h`) * 110 + seededUnit(seed, `${typeId}:o`) * 40) % 360;
    const sat = 0.42 + seededUnit(seed, `${typeId}:s`) * 0.48;
    const light = 0.25 + seededUnit(seed, `${typeId}:l`) * 0.38;
    typeInk[typeId] = hslToHex(hue, sat, light);
  }

  return { paper, surface, ink: PALETTE.black, typeInk };
}

/** Minimum ink/paper contrast before a shade is rejected as too close to the ground. */
const MIN_BRAND_INK_CONTRAST = 2.2;

/** Papers for the pure scheme must clear a higher bar — there are no tints to fall back on. */
const MIN_BRAND_PURE_CONTRAST = 2.5;

function seededPick<T>(items: readonly T[], seed: string, key: string): T {
  const idx = Math.floor(seededUnit(seed, key) * items.length) % items.length;
  return items[idx];
}

/**
 * Family per type — a fresh permutation each round, so every hue is used before any
 * repeats and which types end up sharing a hue varies with the seed.
 */
function dealFamilies(seed: string, count: number): BrandFamily[] {
  const deal: BrandFamily[] = [];
  for (let round = 0; deal.length < count; round++) {
    deal.push(...seededShuffle(BRAND_FAMILIES, seed, `brand:families:${round}`));
  }
  return deal.slice(0, count);
}

function seededShuffle<T>(items: readonly T[], seed: string, key: string): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededUnit(seed, `${key}:${i}`) * (i + 1)) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** One brand color per type: legible against paper, unused if the family still has options. */
function pickBrandShade(
  seed: string,
  typeId: string,
  family: BrandFamily,
  paper: string,
  used: Set<string>,
  inkShades: readonly BrandShade[],
): string {
  const shades = inkShades.filter((s) => s.family === family).map((s) => s.color);
  const legible = shades.filter((c) => contrastRatio(c, paper) >= MIN_BRAND_INK_CONTRAST);
  const pool = legible.length > 0 ? legible : shades;
  const fresh = pool.filter((c) => !used.has(c));
  const color = seededPick(fresh.length > 0 ? fresh : pool, seed, `brand:${typeId}:shade`);
  used.add(color);
  return color;
}

/**
 * Deterministic brand palette — one color per cell type. Hues are dealt so every
 * brand color appears before any repeats; when a hue comes round again it takes a
 * different shade if the pool has one, or the same color if it does not.
 */
function generateBrandStylePalette(
  seed: string,
  inkShades: readonly BrandShade[],
  papers: readonly string[],
): ColorFieldPalette {
  const paper = seededPick(papers, seed, 'brand:paper');
  const darkPaper = relativeLuminance(paper) < 0.35;
  const surface = mixHex(paper, darkPaper ? BRAND.white : BRAND.black, 0.07);

  const families = dealFamilies(seed, COLOR_FIELD_TYPES.length);
  const used = new Set<string>();
  const typeInk: Record<string, string> = {};
  for (let i = 0; i < COLOR_FIELD_TYPES.length; i++) {
    const typeId = COLOR_FIELD_TYPES[i];
    typeInk[typeId] = pickBrandShade(seed, typeId, families[i], paper, used, inkShades);
  }

  return { paper, surface, ink: darkPaper ? BRAND.white : BRAND.black, typeInk };
}

/** Brand hues plus their tint/shade steps, on any brand ground. */
export function generateBrandPalette(seed: string): ColorFieldPalette {
  return generateBrandStylePalette(seed, BRAND_INK_SHADES, BRAND_PAPERS);
}

/**
 * Grounds that keep every unmixed accent legible. The dark brand backdrops are
 * too close in value to the accents themselves, so only white, the pale washes,
 * and near-black survive.
 */
const BRAND_PURE_PAPERS: readonly string[] = BRAND_PAPERS.filter((paper) =>
  BRAND_ACCENTS.every((s) => contrastRatio(s.color, paper) >= MIN_BRAND_PURE_CONTRAST),
);

/** The four brand hues only — no tints or shades, so each hue covers two types. */
export function generateBrandPurePalette(seed: string): ColorFieldPalette {
  return generateBrandStylePalette(seed, BRAND_ACCENTS, BRAND_PURE_PAPERS);
}

/** Schemes whose palette is generated from `colorFieldSeed` rather than fixed. */
const SEEDED_SCHEME_GENERATORS = new Map<ColorSchemeId, (seed: string) => ColorFieldPalette>([
  ['random', generateColorFieldPalette],
  ['brand-random', generateBrandPalette],
  ['brand-pure', generateBrandPurePalette],
]);

export function isSeededScheme(id: ColorSchemeId): boolean {
  return SEEDED_SCHEME_GENERATORS.has(id);
}

export function colorFieldSeedForState(
  schemeId: ColorSchemeId,
  patternSeed: string,
  colorFieldSeed?: string,
): string | undefined {
  if (!isSeededScheme(schemeId)) return undefined;
  return colorFieldSeed ?? patternSeed;
}

export function getColorScheme(id: ColorSchemeId, colorFieldSeed?: string): ColorScheme {
  const base = SCHEME_BY_ID.get(id) ?? SCHEME_BY_ID.get('mono')!;
  const generate = SEEDED_SCHEME_GENERATORS.get(id);
  if (!generate) return base;
  const generated = generate(colorFieldSeed ?? `${id}-default`);
  return {
    ...base,
    paper: generated.paper,
    surface: generated.surface,
    ink: generated.ink,
    typeInk: generated.typeInk,
  };
}

export function isColorSchemeId(id: string): id is ColorSchemeId {
  return SCHEME_BY_ID.has(id as ColorSchemeId);
}

function inkForType(type: CellTypeDef, scheme: ColorScheme): string {
  if (scheme.typeInk?.[type.id]) return scheme.typeInk[type.id]!;
  return scheme.ink;
}

/** Apply scheme colors to cell types (structure unchanged). */
export function applyColorScheme(
  cellTypes: CellTypeDef[],
  schemeId: ColorSchemeId,
  colorFieldSeed?: string,
): CellTypeDef[] {
  const scheme = getColorScheme(schemeId, colorFieldSeed);
  return cellTypes.map((type) => {
    const ink = inkForType(type, scheme);
    if (type.mode === 'fill') {
      return { ...type, fill: ink, stroke: ink };
    }
    if (type.mode === 'none') {
      return { ...type, fill: scheme.paper, stroke: ink };
    }
    return { ...type, fill: scheme.paper, stroke: ink };
  });
}

export interface ResolvedPaperColors {
  paper: string;
  surface: string;
}

export function resolvePaperColors(
  schemeId: ColorSchemeId,
  colorFieldSeed?: string,
): ResolvedPaperColors {
  const scheme = getColorScheme(schemeId, colorFieldSeed);
  return { paper: scheme.paper, surface: scheme.surface };
}

export function schemeSwatchStyle(scheme: ColorScheme): string {
  if (scheme.id === 'color-blocks') {
    return colorBlocksSwatchStyle();
  }
  if (scheme.typeInk) {
    const c = scheme.typeInk;
    return [
      `linear-gradient(135deg`,
      `${c[TYPE_IDS.grid] ?? PALETTE.blue} 0%`,
      `${c[TYPE_IDS.dot] ?? PALETTE.scarlet} 22%`,
      `${c[TYPE_IDS.solid] ?? PALETTE.green} 44%`,
      `${c[TYPE_IDS.crosshatch] ?? PALETTE.red} 66%`,
      `${scheme.paper} 100%)`,
    ].join(', ');
  }
  return `linear-gradient(90deg, ${scheme.paper} 50%, ${scheme.ink} 50%)`;
}
