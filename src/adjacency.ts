import {
  isCircleLike,
  isMeshMode,
  isSolidLike,
} from './cellTypes';
import type { AdjacencyParams, CellEdges, CellTypeDef, GridCell } from './types';
import { TYPE_IDS } from './types';

type TypeMap = Map<string, CellTypeDef>;

function isEmptyOrNone(type: CellTypeDef | undefined): boolean {
  return !type || type.mode === 'none' || type.id === TYPE_IDS.empty;
}

function isMassType(type: CellTypeDef | undefined): boolean {
  if (!type) return false;
  return isSolidLike(type) || type.id === TYPE_IDS.solid || type.id === TYPE_IDS.solidCore;
}

function isDotOrHalo(type: CellTypeDef | undefined): boolean {
  if (!type) return false;
  return isCircleLike(type) || type.id === TYPE_IDS.dotHalo;
}

/** Pass A: remap empty/none cells to grid */
function fillEmptyCells(
  grid: GridCell[][],
  typeMap: TypeMap,
): GridCell[][] {
  return grid.map((row) =>
    row.map((cell) => {
      const type = typeMap.get(cell.typeId);
      if (isEmptyOrNone(type)) {
        return { ...cell, typeId: TYPE_IDS.grid };
      }
      return cell;
    }),
  );
}

interface Blob {
  cells: { col: number; row: number }[];
}

function detectSolidBlobs(
  grid: GridCell[][],
  cols: number,
  rows: number,
  typeMap: TypeMap,
): Blob[] {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const blobs: Blob[] = [];

  const isSolidCell = (col: number, row: number): boolean => {
    const type = typeMap.get(grid[row][col].typeId);
    return isMassType(type) && type?.id !== TYPE_IDS.solidCore;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (visited[row][col] || !isSolidCell(col, row)) continue;

      const cells: { col: number; row: number }[] = [];
      const stack = [{ col, row }];

      while (stack.length > 0) {
        const { col: c, row: r } = stack.pop()!;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        if (visited[r][c] || !isSolidCell(c, r)) continue;
        visited[r][c] = true;
        cells.push({ col: c, row: r });
        stack.push({ col: c + 1, row: r });
        stack.push({ col: c - 1, row: r });
        stack.push({ col: c, row: r + 1 });
        stack.push({ col: c, row: r - 1 });
      }

      if (cells.length > 0) blobs.push({ cells });
    }
  }

  return blobs;
}

/** Pass B: blob halos and solid core labeling */
function assignBlobTransitions(
  grid: GridCell[][],
  cols: number,
  rows: number,
  typeMap: TypeMap,
  params: AdjacencyParams,
): GridCell[][] {
  const result = grid.map((row) => row.map((c) => ({ ...c })));
  const blobs = detectSolidBlobs(result, cols, rows, typeMap);

  for (const blob of blobs) {
    const blobSet = new Set(blob.cells.map((c) => `${c.col},${c.row}`));

    if (params.blobHalosEnabled && blob.cells.length >= params.haloSizeThreshold) {
      // Mark interior as solid-core
      for (const { col, row } of blob.cells) {
        const neighbors = [
          `${col + 1},${row}`,
          `${col - 1},${row}`,
          `${col},${row + 1}`,
          `${col},${row - 1}`,
        ];
        const isInterior = neighbors.every((n) => blobSet.has(n));
        if (isInterior && blob.cells.length > 4) {
          result[row][col].typeId = TYPE_IDS.solidCore;
        }
      }

      // Halo ring: cells adjacent to blob
      const adjacent = new Set<string>();
      for (const { col, row } of blob.cells) {
        const nbs = [
          { col: col + 1, row },
          { col: col - 1, row },
          { col, row: row + 1 },
          { col, row: row - 1 },
        ];
        for (const nb of nbs) {
          const key = `${nb.col},${nb.row}`;
          if (nb.col < 0 || nb.row < 0 || nb.col >= cols || nb.row >= rows) continue;
          if (!blobSet.has(key)) adjacent.add(key);
        }
      }

      for (const key of adjacent) {
        const [col, row] = key.split(',').map(Number);
        const cell = result[row][col];
        const type = typeMap.get(cell.typeId);
        if (!type) continue;

        if (isDotOrHalo(type) || cell.typeId === TYPE_IDS.dot) {
          result[row][col].typeId = TYPE_IDS.dotHalo;
        } else if (isMeshMode(type) || cell.typeId === TYPE_IDS.grid) {
          result[row][col].typeId = TYPE_IDS.gridEdge;
        }
      }
    }
  }

  return result;
}

function shouldDrawEdgeToward(
  neighborType: CellTypeDef | undefined,
  neighborExists: boolean,
): boolean {
  if (!neighborExists) return true; // canvas border
  if (!neighborType) return true;
  if (isMeshMode(neighborType)) return true;
  if (isMassType(neighborType) || isDotOrHalo(neighborType)) return true;
  if (neighborType.mode === 'fill' || neighborType.mode === 'circle') return true;
  return true;
}

/** Pass C: compute edge masks for mesh cells */
function computeEdgeMasks(
  grid: GridCell[][],
  cols: number,
  rows: number,
  typeMap: TypeMap,
): GridCell[][] {
  return grid.map((row, rowIdx) =>
    row.map((cell, colIdx) => {
      const type = typeMap.get(cell.typeId);
      if (!isMeshMode(type)) return cell;

      const edges: CellEdges = {
        top: shouldDrawEdgeToward(
          rowIdx > 0 ? typeMap.get(grid[rowIdx - 1][colIdx].typeId) : undefined,
          rowIdx > 0,
        ),
        right: shouldDrawEdgeToward(
          colIdx < cols - 1 ? typeMap.get(grid[rowIdx][colIdx + 1].typeId) : undefined,
          colIdx < cols - 1,
        ),
        bottom: shouldDrawEdgeToward(
          rowIdx < rows - 1 ? typeMap.get(grid[rowIdx + 1][colIdx].typeId) : undefined,
          rowIdx < rows - 1,
        ),
        left: shouldDrawEdgeToward(
          colIdx > 0 ? typeMap.get(grid[rowIdx][colIdx - 1].typeId) : undefined,
          colIdx > 0,
        ),
      };

      return { ...cell, edges };
    }),
  );
}

export function applyAdjacencyPostProcess(
  grid: GridCell[][],
  cellTypes: CellTypeDef[],
  cols: number,
  rows: number,
  params: AdjacencyParams,
): GridCell[][] {
  const typeMap: TypeMap = new Map(cellTypes.map((t) => [t.id, t]));

  let result = fillEmptyCells(grid, typeMap);
  result = assignBlobTransitions(result, cols, rows, typeMap, params);
  result = computeEdgeMasks(result, cols, rows, typeMap);

  return result;
}

export function getTypeAt(
  grid: GridCell[][],
  col: number,
  row: number,
  typeMap: TypeMap,
): CellTypeDef | undefined {
  if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) return undefined;
  return typeMap.get(grid[row][col].typeId);
}
