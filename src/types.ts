export type RenderMode =
  | 'none'
  | 'fill'
  | 'stroke'
  | 'mesh'
  | 'circle'
  | 'hexagon'
  | 'crosshatch'
  | 'svg';

export type ColorApplication = 'fill' | 'stroke' | 'both';

export interface CellTypeDef {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  /** How often this type appears (0–1). Bulk types normalize together; border types are independent. */
  density: number;
  mode: RenderMode;
  fill: string;
  stroke: string;
  strokeWidth: number;
  colorApplication: ColorApplication;
  circleRadius: number;
  /** Margin on each side for fill mode (fraction of cell size). Background shows through as internal grid. */
  fillInset: number;
  hatchSpacing: number;
  hatchAngle: number;
  /** Cells inward from a region border (crosshatch / outline only). */
  borderDepth?: number;
  /** When false, type is assigned only by adjacency post-process */
  noiseAssigned?: boolean;
  svgSymbolId?: string;
  svgMarkup?: string;
  /** Symbol viewBox, e.g. "0 0 59 59" */
  svgViewBox?: string;
}

export interface NoiseParams {
  scale: number;
  octaves: number;
  persistence: number;
}

export interface AnimationParams {
  enabled: boolean;
  /** Motion speed multiplier (0.05–1). Slower = longer wall-clock loop. */
  speed: number;
  /** Base cycle length in seconds at speed 1.0 (actual loop = loopLengthSec / speed). */
  loopLengthSec: number;
  /** Cycle color-block palette when using the color-blocks scheme. */
  animateColorBlocks: boolean;
}

/** 3D shade band assigned during shapes3d rendering (drives visual density scaling). */
export type ShadeBand = 'highlight' | 'light' | 'mid' | 'dark' | 'deep' | 'silhouette';

export interface GridCell {
  typeId: string;
  /** Smaller, lighter chain logos along long type boundaries. */
  logoMuted?: boolean;
  /** Set in 3D mode — scales cell appearance to match lighting. */
  shadeBand?: ShadeBand;
}

export interface LogoSite {
  col: number;
  row: number;
  massNeighborKeys: Set<string>;
  muted?: boolean;
}

export interface ResolvedColors {
  fill: string;
  stroke: string;
}

export interface WeightedItem {
  id: string;
  enabled: boolean;
  order: number;
  density: number;
}

export type GenerateMode = 'pattern' | 'shapes3d' | 'gradient';

export interface ColorBlock {
  col: number;
  row: number;
  cols: number;
  rows: number;
  color: string;
}

export type ColorSchemeId =
  | 'mono'
  | 'green-light-on-dark'
  | 'blue-light-on-dark'
  | 'red-light-on-dark'
  | 'pink-light-on-dark'
  | 'color-blocks'
  | 'random';

export type Shape3dKind =
  | 'sphere'
  | 'box'
  | 'torus'
  | 'ring'
  | 'ringArc'
  | 'disc'
  | 'capsule'
  | 'cone'
  | 'cylinder';

export interface Shape3dParams {
  kind: Shape3dKind;
  position: { x: number; y: number; z: number };
  /** Uniform scale, 0.3–4 */
  scale: number;
  /** Pitch in degrees (-89…89) */
  rotationX: number;
  /** Yaw in degrees */
  rotationY: number;
}

/** Pattern cell type used for each 3D shading band. */
export interface Shapes3dCellMapping {
  highlight: string;
  light: string;
  mid: string;
  dark: string;
  deep: string;
  silhouette: string;
  void: string;
}

/** Pattern cell type for each gradient density step (dense → sparse). */
export interface GradientCellMapping {
  solid: string;
  hexagon: string;
  dot: string;
  ultra: string;
  grid: string;
  void: string;
}

export interface AppState {
  seed: string;
  cols: number;
  rows: number;
  cellSize: number;
  generateMode: GenerateMode;
  colorSchemeId: ColorSchemeId;
  /** Seed for random palette; new value on randomize or re-select. */
  colorFieldSeed?: string;
  shapeNoise: NoiseParams;
  shape3d: Shape3dParams;
  animation: AnimationParams;
  cellTypes: CellTypeDef[];
  loopSeamlessly: boolean;
}

export interface GeneratorContext {
  seed: string;
  cols: number;
  rows: number;
  generateMode: GenerateMode;
  cellTypes: CellTypeDef[];
  shapeNoise: NoiseParams;
  shape3d: Shape3dParams;
  animation: AnimationParams;
  time: number;
}

export interface RenderContext {
  grid: GridCell[][];
  cellTypes: CellTypeDef[];
  cellSize: number;
  cols: number;
  rows: number;
  paper: string;
  surface: string;
  colorSchemeId?: ColorSchemeId;
  generateMode?: GenerateMode;
  colorBlocks?: ColorBlock[] | null;
}

/** Well-known cell type ids */
export const TYPE_IDS = {
  grid: 'grid',
  dot: 'dot',
  hexagon: 'hexagon',
  solid: 'solid',
  logo: 'logo',
  outline: 'outline',
  crosshatch: 'crosshatch',
  empty: 'empty',
} as const;

/** Legacy 3D-only type ids removed from the cell type editor. */
export const LEGACY_SHADE_TYPE_IDS = [
  'shade-highlight',
  'shade-light',
  'shade-mid',
  'shade-dark',
  'shade-deep',
  'silhouette',
] as const;
