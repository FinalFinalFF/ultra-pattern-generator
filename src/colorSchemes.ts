import type { CellTypeDef, ColorSchemeId } from './types';
import { TYPE_IDS } from './types';
import { BRAND } from './brandColors';
import { colorBlocksSwatchStyle } from './colorBlocks';
import { hashSeed } from './noise';

export { BRAND } from './brandColors';

export interface ColorFieldPalette {
  paper: string;
  surface: string;
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

  return { paper, surface, typeInk };
}

export function colorFieldSeedForState(
  schemeId: ColorSchemeId,
  patternSeed: string,
  colorFieldSeed?: string,
): string | undefined {
  if (schemeId !== 'random') return undefined;
  return colorFieldSeed ?? patternSeed;
}

export function getColorScheme(id: ColorSchemeId, colorFieldSeed?: string): ColorScheme {
  const base = SCHEME_BY_ID.get(id) ?? SCHEME_BY_ID.get('mono')!;
  if (id !== 'random') return base;
  const generated = generateColorFieldPalette(colorFieldSeed ?? 'random-default');
  return {
    ...base,
    paper: generated.paper,
    surface: generated.surface,
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
  if (scheme.id === 'random') {
    const c = scheme.typeInk!;
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
