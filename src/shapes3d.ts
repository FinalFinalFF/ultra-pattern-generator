import { hashSeed } from './noise';
import { SHAPE3D_BACKGROUND_TYPE } from './shapes3dMapping';
import type { GridCell, Shape3dKind, Shape3dParams, Shapes3dCellMapping, ShadeBand } from './types';

export const SHAPES3D_COLS = 72;
export const SHAPES3D_ROWS = 72;
export const SHAPES3D_VIEW_HALF = 1.0;

type Vec3 = [number, number, number];

type ShapeKind = Shape3dKind;

interface ShapeInstance {
  kind: ShapeKind;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  params: number[];
}

interface Scene {
  shapes: ShapeInstance[];
}

interface Light {
  direction: Vec3;
}

interface Camera {
  originBase: Vec3;
  right: Vec3;
  up: Vec3;
  dir: Vec3;
}

const EPS = 0.001;
const MAX_MARCH = 128;
const HIT_EPS = 0.008;
const RIM_GRAD = 2.8;
const CAM_DIST = 6.0;

function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

function rotateZ(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

function toLocal(p: Vec3, shape: ShapeInstance): Vec3 {
  let q = sub(p, shape.position);
  q = rotateX(q, -shape.rotation[0]);
  q = rotateY(q, -shape.rotation[1]);
  q = rotateZ(q, -shape.rotation[2]);
  return [q[0] / shape.scale[0], q[1] / shape.scale[1], q[2] / shape.scale[2]];
}

function sdfSphere(p: Vec3, r: number): number {
  return len(p) - r;
}

function sdfBox(p: Vec3, b: Vec3): number {
  const q = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]];
  const outside = len([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)]);
  const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
  return outside + inside;
}

function sdfTorus(p: Vec3, R: number, r: number): number {
  const q = [Math.hypot(p[0], p[2]) - R, p[1]];
  return Math.hypot(q[0], q[1]) - r;
}

/** Flat annulus band in the XZ plane (ribbon ring). */
function sdfFlatRing(p: Vec3, R: number, tubeR: number, halfHeight: number): number {
  const dRing = Math.abs(Math.hypot(p[0], p[2]) - R) - tubeR;
  const dCap = Math.abs(p[1]) - halfHeight;
  return Math.max(dRing, dCap);
}

/** Partial flat ring arc — C-shaped ribbon. halfSweep is radians from +X to each edge. */
function sdfFlatRingArc(p: Vec3, R: number, tubeR: number, halfHeight: number, halfSweep: number): number {
  const xz = Math.hypot(p[0], p[2]);
  const dBand = Math.max(Math.abs(xz - R) - tubeR, Math.abs(p[1]) - halfHeight);
  const angle = Math.atan2(p[2], p[0]);
  const excess = Math.max(Math.abs(angle) - halfSweep, 0);
  const dAngle = excess * Math.max(xz, R * 0.5);
  return Math.max(dBand, dAngle);
}

function sdfDisc(p: Vec3, r: number, halfHeight: number): number {
  const dRadial = Math.hypot(p[0], p[2]) - r;
  const dCap = Math.abs(p[1]) - halfHeight;
  return Math.max(dRadial, dCap);
}

function sdfCapsuleY(p: Vec3, halfLength: number, r: number): number {
  const y = p[1];
  const q = Math.hypot(p[0], p[2]);
  if (y < -halfLength) return Math.hypot(q, y + halfLength) - r;
  if (y > halfLength) return Math.hypot(q, y - halfLength) - r;
  return q - r;
}

function sdfCone(p: Vec3, h: number, r: number): number {
  const q = Math.hypot(p[0], p[2]);
  const k = r / h;
  return Math.max(q - k * (h - p[1]), p[1] - h, -p[1]);
}

function sdfCylinder(p: Vec3, h: number, r: number): number {
  const d0 = Math.hypot(p[0], p[2]) - r;
  const d1 = Math.abs(p[1]) - h;
  return Math.min(Math.max(d0, d1), 0) + Math.hypot(Math.max(d0, 0), Math.max(d1, 0));
}

function shapeSDF(local: Vec3, shape: ShapeInstance): number {
  switch (shape.kind) {
    case 'sphere':
      return sdfSphere(local, shape.params[0]);
    case 'box':
      return sdfBox(local, vec3(shape.params[0], shape.params[1], shape.params[2]));
    case 'torus':
      return sdfTorus(local, shape.params[0], shape.params[1]);
    case 'ring':
      return sdfFlatRing(local, shape.params[0], shape.params[1], shape.params[2]);
    case 'ringArc':
      return sdfFlatRingArc(local, shape.params[0], shape.params[1], shape.params[2], shape.params[3]);
    case 'disc':
      return sdfDisc(local, shape.params[0], shape.params[1]);
    case 'capsule':
      return sdfCapsuleY(local, shape.params[0], shape.params[1]);
    case 'cone':
      return sdfCone(local, shape.params[0], shape.params[1]);
    case 'cylinder':
      return sdfCylinder(local, shape.params[0], shape.params[1]);
  }
}

function instanceSDF(p: Vec3, shape: ShapeInstance): number {
  const local = toLocal(p, shape);
  const d = shapeSDF(local, shape);
  return d * shape.scale[0];
}

function sceneSDF(p: Vec3, scene: Scene): number {
  let d = Infinity;
  for (const shape of scene.shapes) {
    d = Math.min(d, instanceSDF(p, shape));
  }
  return d;
}

function estimateNormal(p: Vec3, scene: Scene): Vec3 {
  const dx = sceneSDF(add(p, vec3(EPS, 0, 0)), scene) - sceneSDF(sub(p, vec3(EPS, 0, 0)), scene);
  const dy = sceneSDF(add(p, vec3(0, EPS, 0)), scene) - sceneSDF(sub(p, vec3(0, EPS, 0)), scene);
  const dz = sceneSDF(add(p, vec3(0, 0, EPS)), scene) - sceneSDF(sub(p, vec3(0, 0, EPS)), scene);
  return normalize(vec3(dx, dy, dz));
}

function gradientMagnitude(p: Vec3, scene: Scene): number {
  const dx = sceneSDF(add(p, vec3(EPS, 0, 0)), scene) - sceneSDF(sub(p, vec3(EPS, 0, 0)), scene);
  const dy = sceneSDF(add(p, vec3(0, EPS, 0)), scene) - sceneSDF(sub(p, vec3(0, EPS, 0)), scene);
  const dz = sceneSDF(add(p, vec3(0, 0, EPS)), scene) - sceneSDF(sub(p, vec3(0, 0, EPS)), scene);
  return Math.hypot(dx, dy, dz) / (2 * EPS);
}

function defaultParamsForKind(kind: ShapeKind): number[] {
  switch (kind) {
    case 'sphere':
      return [0.65];
    case 'box':
      return [0.5, 0.5, 0.5];
    case 'torus':
      return [0.48, 0.18];
    case 'ring':
      return [0.52, 0.2, 0.07];
    case 'ringArc':
      return [0.52, 0.2, 0.07, 2.15];
    case 'disc':
      return [0.58, 0.06];
    case 'capsule':
      return [0.42, 0.17];
    case 'cone':
      return [0.7, 0.34];
    case 'cylinder':
      return [0.5, 0.34];
  }
}

function buildScene(params: Shape3dParams): Scene {
  const rotX = (params.rotationX * Math.PI) / 180;
  const rotY = (params.rotationY * Math.PI) / 180;
  const s = params.scale;
  return {
    shapes: [
      {
        kind: params.kind,
        position: vec3(params.position.x, params.position.y, params.position.z),
        rotation: vec3(rotX, rotY, 0),
        scale: vec3(s, s, s),
        params: defaultParamsForKind(params.kind),
      },
    ],
  };
}

function buildIsometricCamera(): Camera {
  const az = Math.PI / 4;
  const el = (35 * Math.PI) / 180;
  const ce = Math.cos(el);
  const dir = normalize(vec3(-Math.cos(az) * ce, -Math.sin(el), -Math.sin(az) * ce));
  const worldUp = vec3(0, 1, 0);
  let right = normalize(cross(worldUp, dir));
  if (len(right) < 0.01) right = vec3(1, 0, 0);
  const up = normalize(cross(dir, right));
  const originBase = scaleVec(dir, -CAM_DIST);
  return { originBase, right, up, dir };
}

export function cellToView(
  col: number,
  row: number,
  cols = SHAPES3D_COLS,
  rows = SHAPES3D_ROWS,
): { nx: number; ny: number } {
  const cell = (2 * SHAPES3D_VIEW_HALF) / Math.max(cols, rows);
  const nx = (col + 0.5 - cols / 2) * cell;
  const ny = (row + 0.5 - rows / 2) * cell;
  return { nx, ny };
}

function seededUnit(seed: string, index: number): number {
  return hashSeed(`${seed}:3d:${index}`) / 0xffffffff;
}

function buildLight(seed: string): Light {
  const az = seededUnit(seed, 200) * Math.PI * 2;
  const elev = 0.35 + seededUnit(seed, 201) * 0.45;
  const ce = Math.cos(elev);
  return {
    direction: normalize(vec3(Math.cos(az) * ce, Math.sin(elev), Math.sin(az) * ce)),
  };
}

function shadeToCell(
  lambert: number,
  facing: number,
  isRim: boolean,
  mapping: Shapes3dCellMapping,
): { typeId: string; shadeBand: ShadeBand } {
  if (isRim) return { typeId: mapping.silhouette, shadeBand: 'silhouette' };
  const shade = 0.1 + lambert * 0.78 + facing * 0.12;
  if (shade >= 0.82) return { typeId: mapping.highlight, shadeBand: 'highlight' };
  if (shade >= 0.64) return { typeId: mapping.light, shadeBand: 'light' };
  if (shade >= 0.46) return { typeId: mapping.mid, shadeBand: 'mid' };
  if (shade >= 0.28) return { typeId: mapping.dark, shadeBand: 'dark' };
  return { typeId: mapping.deep, shadeBand: 'deep' };
}

interface TraceHit {
  hit: boolean;
  shade: number;
  facing: number;
  isRim: boolean;
}

function traceRay(origin: Vec3, dir: Vec3, scene: Scene, light: Light, viewDir: Vec3): TraceHit {
  let t = 0;
  let p = origin;

  for (let i = 0; i < MAX_MARCH; i++) {
    const d = sceneSDF(p, scene);
    if (d < HIT_EPS) {
      const normal = estimateNormal(p, scene);
      const lambert = Math.max(0, dot(normal, light.direction));
      const facing = Math.max(0, dot(normal, viewDir));
      const grad = gradientMagnitude(p, scene);
      const isRim = grad > RIM_GRAD;
      return { hit: true, shade: lambert, facing, isRim };
    }
    if (t > CAM_DIST + 4) break;
    const step = Math.max(d * 0.85, 0.005);
    t += step;
    p = add(origin, scaleVec(dir, t));
  }

  return { hit: false, shade: 0, facing: 0, isRim: false };
}

function traceCell(
  col: number,
  row: number,
  scene: Scene,
  light: Light,
  camera: Camera,
): TraceHit {
  const { nx, ny } = cellToView(col, row);
  const origin = add(
    add(camera.originBase, scaleVec(camera.right, nx)),
    scaleVec(camera.up, ny),
  );
  const viewDir = scaleVec(camera.dir, -1);
  return traceRay(origin, camera.dir, scene, light, viewDir);
}

function applySilhouettePass(
  grid: GridCell[][],
  hits: boolean[][],
  cols: number,
  rows: number,
  silhouetteId: string,
): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!hits[row][col]) continue;
      const onEdge =
        (col === 0 || !hits[row][col - 1]) ||
        (col === cols - 1 || !hits[row][col + 1]) ||
        (row === 0 || !hits[row - 1][col]) ||
        (row === rows - 1 || !hits[row + 1][col]);
      if (onEdge) {
        grid[row][col] = { typeId: silhouetteId, shadeBand: 'silhouette' };
      }
    }
  }
}

function renderTypeGrid(
  seed: string,
  shape3d: Shape3dParams,
  mapping: Shapes3dCellMapping,
): GridCell[][] {
  const scene = buildScene(shape3d);
  const light = buildLight(seed);
  const camera = buildIsometricCamera();
  const grid: GridCell[][] = [];
  const hits: boolean[][] = [];
  const backgroundId = SHAPE3D_BACKGROUND_TYPE;

  for (let row = 0; row < SHAPES3D_ROWS; row++) {
    const rowCells: GridCell[] = [];
    const rowHits: boolean[] = [];
    for (let col = 0; col < SHAPES3D_COLS; col++) {
      const { hit, shade, facing, isRim } = traceCell(col, row, scene, light, camera);
      rowHits.push(hit);
      rowCells.push(
        hit
          ? shadeToCell(shade, facing, isRim, mapping)
          : { typeId: backgroundId },
      );
    }
    hits.push(rowHits);
    grid.push(rowCells);
  }

  applySilhouettePass(grid, hits, SHAPES3D_COLS, SHAPES3D_ROWS, mapping.silhouette);
  return grid;
}

const VIEW_FIT_MARGIN = 0.88;

interface ViewHitStats {
  extent: number;
  centroidX: number;
  centroidY: number;
  hasHits: boolean;
}

function measureViewHitStats(shape3d: Shape3dParams): ViewHitStats {
  const scene = buildScene(shape3d);
  const light = buildLight('view-fit');
  const camera = buildIsometricCamera();
  const cell = (2 * SHAPES3D_VIEW_HALF) / Math.max(SHAPES3D_COLS, SHAPES3D_ROWS);
  const hits: { nx: number; ny: number }[] = [];

  for (let row = 0; row < SHAPES3D_ROWS; row++) {
    for (let col = 0; col < SHAPES3D_COLS; col++) {
      if (traceCell(col, row, scene, light, camera).hit) {
        hits.push(cellToView(col, row));
      }
    }
  }

  if (!hits.length) {
    return { extent: 0.65, centroidX: 0, centroidY: 0, hasHits: false };
  }

  const centroidX = hits.reduce((sum, h) => sum + h.nx, 0) / hits.length;
  const centroidY = hits.reduce((sum, h) => sum + h.ny, 0) / hits.length;
  let extent = 0;
  for (const h of hits) {
    extent = Math.max(extent, Math.abs(h.nx - centroidX), Math.abs(h.ny - centroidY));
  }

  return {
    extent: extent + cell * 0.55,
    centroidX,
    centroidY,
    hasHits: true,
  };
}

/** Default transform for a shape kind — centered and scaled to fit the view. */
export function defaultShape3dForKind(kind: Shape3dKind): Shape3dParams {
  const rotationX = 0;
  const rotationY = kind === 'ringArc' ? 0 : 25;
  let params: Shape3dParams = {
    kind,
    position: { x: 0, y: 0, z: 0 },
    rotationX,
    rotationY,
    scale: 1,
  };

  for (let i = 0; i < 5; i++) {
    const { centroidX, centroidY, hasHits } = measureViewHitStats(params);
    if (!hasHits || (Math.abs(centroidX) < 0.015 && Math.abs(centroidY) < 0.015)) break;
    params = {
      ...params,
      position: {
        x: params.position.x - centroidX * 0.55,
        y: params.position.y - centroidY * 0.55,
        z: params.position.z,
      },
    };
  }

  const { extent, hasHits } = measureViewHitStats(params);
  const scale =
    hasHits && extent > 0.001
      ? Math.min(4, Math.max(0.3, VIEW_FIT_MARGIN / extent))
      : 1.15;

  return {
    ...params,
    scale: Math.round(scale * 20) / 20,
  };
}

export function measureHitRate(
  _seed: string,
  shape3d: Shape3dParams,
  _mapping: Shapes3dCellMapping,
): number {
  const scene = buildScene(shape3d);
  const light = buildLight('hit-rate');
  const camera = buildIsometricCamera();
  let hits = 0;
  const total = SHAPES3D_COLS * SHAPES3D_ROWS;

  for (let row = 0; row < SHAPES3D_ROWS; row++) {
    for (let col = 0; col < SHAPES3D_COLS; col++) {
      if (traceCell(col, row, scene, light, camera).hit) hits++;
    }
  }

  return hits / total;
}

export function assignShapes3d(
  seed: string,
  shape3d: Shape3dParams,
  mapping: Shapes3dCellMapping,
): GridCell[][] {
  return renderTypeGrid(seed, shape3d, mapping);
}
