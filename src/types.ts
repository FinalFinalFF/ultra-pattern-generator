export type RenderMode =
  | 'none'
  | 'fill'
  | 'stroke'
  | 'mesh'
  | 'circle'
  | 'crosshatch'
  | 'diagonal'
  | 'svg';

export type ColorApplication = 'fill' | 'stroke' | 'both' | 'accent';

export interface CellTypeDef {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  weight: number;
  mode: RenderMode;
  fill: string;
  stroke: string;
  strokeWidth: number;
  colorApplication: ColorApplication;
  circleRadius: number;
  hatchSpacing: number;
  hatchAngle: number;
  /** When false, type is assigned only by adjacency post-process */
  noiseAssigned?: boolean;
  svgSymbolId?: string;
  svgMarkup?: string;
}

export interface ColorDef {
  id: string;
  name: string;
  hex: string;
  enabled: boolean;
  order: number;
  weight: number;
}

export interface ColorScheme {
  id: string;
  name: string;
  backgroundColor: string;
  colors: ColorDef[];
}

export interface NoiseParams {
  scale: number;
  octaves: number;
  persistence: number;
}

export interface ColorNoiseParams extends NoiseParams {
  enabled: boolean;
  seedOffset: number;
}

export interface AnimationParams {
  speed: number;
  colorDrift: number;
}

export interface CellEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface GridCell {
  typeId: string;
  colorId: string | null;
  edges?: CellEdges;
}

export interface ResolvedColors {
  fill: string;
  stroke: string;
}

export interface WeightedItem {
  id: string;
  enabled: boolean;
  order: number;
  weight: number;
}

export interface AdjacencyParams {
  blobHalosEnabled: boolean;
  haloSizeThreshold: number;
}

export interface AppState {
  seed: string;
  cols: number;
  rows: number;
  cellSize: number;
  shapeNoise: NoiseParams;
  colorNoise: ColorNoiseParams;
  animation: AnimationParams;
  adjacency: AdjacencyParams;
  cellTypes: CellTypeDef[];
  colorSchemes: ColorScheme[];
  activeSchemeId: string;
  loopSeamlessly: boolean;
}

export interface GeneratorContext {
  seed: string;
  cols: number;
  rows: number;
  cellTypes: CellTypeDef[];
  shapeNoise: NoiseParams;
  colorNoise: ColorNoiseParams;
  animation: AnimationParams;
  adjacency: AdjacencyParams;
  activeScheme: ColorScheme;
  time: number;
}

export interface RenderContext {
  grid: GridCell[][];
  cellTypes: CellTypeDef[];
  activeScheme: ColorScheme;
  colorNoiseEnabled: boolean;
  cellSize: number;
  cols: number;
  rows: number;
}

/** Well-known cell type ids */
export const TYPE_IDS = {
  grid: 'grid',
  dot: 'dot',
  solid: 'solid',
  gridEdge: 'grid-edge',
  dotHalo: 'dot-halo',
  solidCore: 'solid-core',
  empty: 'empty',
} as const;
