/** Brand accent + dark background pairs. */
export const BRAND = {
  green: '#017D42',
  greenDark: '#2C392C',
  blue: '#005BB1',
  blueDark: '#232346',
  red: '#B52C0C',
  redDark: '#2C2821',
  pink: '#CE07A6',
  pinkDark: '#392C33',
  white: '#FFFFFF',
  black: '#181818',
} as const;

/** Primary color-block palette: red, green, blue, pink. */
export const BLOCK_PALETTE = [BRAND.red, BRAND.green, BRAND.blue, BRAND.pink] as const;

/** Relative share when assigning block colors (sums to 1). */
export const BLOCK_COLOR_WEIGHTS = [
  { color: BRAND.red, weight: 0.12 },
  { color: BRAND.green, weight: 0.38 },
  { color: BRAND.blue, weight: 0.38 },
  { color: BRAND.pink, weight: 0.12 },
] as const;

type Hex = string;

function parseHex(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): Hex {
  const byte = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** Blend two hex colors — t=0 returns a, t=1 returns b. */
export function mixHex(a: Hex, b: Hex, t: number): Hex {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function relativeLuminance(hex: Hex): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) – 21 (black on white). */
export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export type BrandFamily = 'green' | 'blue' | 'red' | 'pink';

export const BRAND_FAMILIES: readonly BrandFamily[] = ['green', 'blue', 'red', 'pink'];

const BRAND_ACCENT: Record<BrandFamily, string> = {
  green: BRAND.green,
  blue: BRAND.blue,
  red: BRAND.red,
  pink: BRAND.pink,
};

const BRAND_BACKDROP: Record<BrandFamily, string> = {
  green: BRAND.greenDark,
  blue: BRAND.blueDark,
  red: BRAND.redDark,
  pink: BRAND.pinkDark,
};

export interface BrandShade {
  family: BrandFamily;
  color: string;
}

/** Tint → base → shade steps per brand hue. Ink candidates for the brand-random scheme. */
export const BRAND_INK_SHADES: readonly BrandShade[] = BRAND_FAMILIES.flatMap((family) => {
  const accent = BRAND_ACCENT[family];
  return [
    { family, color: mixHex(accent, BRAND.white, 0.42) },
    { family, color: mixHex(accent, BRAND.white, 0.2) },
    { family, color: accent },
    { family, color: mixHex(accent, BRAND.black, 0.34) },
  ];
});

/** The four brand hues, unmixed — ink candidates for the brand-pure scheme. */
export const BRAND_ACCENTS: readonly BrandShade[] = BRAND_FAMILIES.map((family) => ({
  family,
  color: BRAND_ACCENT[family],
}));

/** Ground options: white, a pale wash of each hue, near-black, and the brand dark backdrops. */
export const BRAND_PAPERS: readonly string[] = [
  BRAND.white,
  ...BRAND_FAMILIES.map((family) => mixHex(BRAND_ACCENT[family], BRAND.white, 0.9)),
  BRAND.black,
  ...BRAND_FAMILIES.map((family) => BRAND_BACKDROP[family]),
];
