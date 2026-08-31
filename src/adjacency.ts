import {
  isNoiseBulkType,
  isVoidCell,
} from './cellTypes';
import type { CellTypeDef, GridCell } from './types';
import { TYPE_IDS } from './types';

type TypeMap = Map<string, CellTypeDef>;

const SMALL_VOID_MAX = 6;
const BULK_SPECKLE_PASSES = 2;

const NEIGHBOR_DELTAS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

function cloneGrid(grid: GridCell[][]): GridCell[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

/** Ensure disabled / none-mode types fall back to grid; preserve void cells. */
function fillEmptyCells(grid: GridCell[][], typeMap: TypeMap): GridCell[][] {
  return grid.map((row) =>
    row.map((cell) => {
      if (cell.typeId === TYPE_IDS.empty) return cell;
      const type = typeMap.get(cell.typeId);
      if (!type) {
        return { ...cell, typeId: TYPE_IDS.grid };
      }
      if (type.mode === 'none' && !isVoidCell(type)) {
        return { ...cell, typeId: TYPE_IDS.grid };
      }
      return cell;
    }),
  );
}

function dominantNeighborType(
  grid: GridCell[][],
  col: number,
  row: number,
  cols: number,
  rows: number,
  excludeVoid = true,
): string {
  const counts = new Map<string, number>();
  for (const [dc, dr] of NEIGHBOR_DELTAS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
    const id = grid[nr][nc].typeId;
    if (excludeVoid && id === TYPE_IDS.empty) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let bestId: string = TYPE_IDS.grid;
  let bestCount = -1;
  for (const [id, count] of counts) {
    if (count > bestCount || (count === bestCount && id < bestId)) {
      bestCount = count;
      bestId = id;
    }
  }
  return bestId;
}

/** Remove tiny void pinholes — reassign to surrounding bulk type. */
function mergeSmallVoidIslands(grid: GridCell[][], cols: number, rows: number): GridCell[][] {
  const result = cloneGrid(grid);
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (result[row][col].typeId !== TYPE_IDS.empty || visited[row][col]) continue;

      const stack: [number, number][] = [[col, row]];
      const component: [number, number][] = [];
      visited[row][col] = true;

      while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        component.push([c, r]);
        for (const [dc, dr] of NEIGHBOR_DELTAS) {
          const nc = c + dc;
          const nr = r + dr;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (visited[nr][nc] || result[nr][nc].typeId !== TYPE_IDS.empty) continue;
          visited[nr][nc] = true;
          stack.push([nc, nr]);
        }
      }

      if (component.length > SMALL_VOID_MAX) continue;

      for (const [c, r] of component) {
        result[r][c] = {
          ...result[r][c],
          typeId: dominantNeighborType(result, c, r, cols, rows),
        };
      }
    }
  }

  return result;
}

/** Collapse isolated bulk specks into neighboring territories. */
function removeIsolatedBulkSpeckle(grid: GridCell[][], cols: number, rows: number): GridCell[][] {
  let result = cloneGrid(grid);

  for (let pass = 0; pass < BULK_SPECKLE_PASSES; pass++) {
    const next = cloneGrid(result);
    let changed = false;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = result[row][col];
        if (!isNoiseBulkType(cell.typeId) || cell.typeId === TYPE_IDS.grid) continue;

        let sameNeighbors = 0;
        for (const [dc, dr] of NEIGHBOR_DELTAS) {
          const nc = col + dc;
          const nr = row + dr;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (result[nr][nc].typeId === cell.typeId) sameNeighbors++;
        }

        if (sameNeighbors === 0) {
          next[row][col] = {
            ...cell,
            typeId: dominantNeighborType(result, col, row, cols, rows),
          };
          changed = true;
        }
      }
    }

    result = next;
    if (!changed) break;
  }

  return result;
}

/** Fill void cells back to neighbors when they exceed the void slider. */
function capExcessiveVoid(
  grid: GridCell[][],
  cols: number,
  rows: number,
  maxFraction: number,
): GridCell[][] {
  const total = cols * rows;
  if (total === 0) return grid;

  const maxVoid = Math.floor(total * Math.min(1, Math.max(0, maxFraction)));
  let voidCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (grid[row][col].typeId === TYPE_IDS.empty) voidCount++;
    }
  }

  if (voidCount <= maxVoid) return grid;

  const result = cloneGrid(grid);
  let toConvert = voidCount - maxVoid;

  while (toConvert > 0) {
    let best: [number, number] | null = null;
    let bestScore = -1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (result[row][col].typeId !== TYPE_IDS.empty) continue;
        let nonVoidNeighbors = 0;
        for (const [dc, dr] of NEIGHBOR_DELTAS) {
          const nc = col + dc;
          const nr = row + dr;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (result[nr][nc].typeId !== TYPE_IDS.empty) nonVoidNeighbors++;
        }
        if (nonVoidNeighbors > bestScore) {
          bestScore = nonVoidNeighbors;
          best = [col, row];
        }
      }
    }

    if (!best) break;
    const [col, row] = best;
    result[row][col] = {
      ...result[row][col],
      typeId: dominantNeighborType(result, col, row, cols, rows, false),
    };
    toConvert--;
  }

  return result;
}

export function applyAdjacencyPostProcess(
  grid: GridCell[][],
  cellTypes: CellTypeDef[],
): GridCell[][] {
  const typeMap: TypeMap = new Map(cellTypes.map((t) => [t.id, t]));
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  const voidType = typeMap.get(TYPE_IDS.empty);
  const maxVoidFraction = voidType?.enabled
    ? Math.min(1, Math.max(0, voidType.density))
    : 0;

  let result = fillEmptyCells(grid, typeMap);
  if (cols > 0 && rows > 0) {
    if (maxVoidFraction < 0.995) {
      result = mergeSmallVoidIslands(result, cols, rows);
      result = capExcessiveVoid(result, cols, rows, maxVoidFraction);
    }
    result = removeIsolatedBulkSpeckle(result, cols, rows);
  }
  return result;
}
