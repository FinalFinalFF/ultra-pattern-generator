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
