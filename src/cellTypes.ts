import type { CellTypeDef, WeightedItem } from './types';
import { TYPE_IDS } from './types';

export function createId(): string {
  return crypto.randomUUID();
}

export function getDefaultCellTypes(): CellTypeDef[] {
  return [
    {
      id: TYPE_IDS.grid,
      name: 'Grid',
      enabled: true,
      order: 0,
      weight: 0.5,
      mode: 'mesh',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.dot,
      name: 'Dot',
      enabled: true,
      order: 1,
      weight: 0.3,
      mode: 'circle',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'both',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.solid,
      name: 'Solid',
      enabled: true,
      order: 2,
      weight: 0.2,
      mode: 'fill',
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'fill',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: true,
    },
    {
      id: TYPE_IDS.gridEdge,
      name: 'Grid Edge',
      enabled: true,
      order: 3,
      weight: 0,
      mode: 'mesh',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'stroke',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
    {
      id: TYPE_IDS.dotHalo,
      name: 'Dot Halo',
      enabled: true,
      order: 4,
      weight: 0,
      mode: 'circle',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'both',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
    {
      id: TYPE_IDS.solidCore,
      name: 'Solid Core',
      enabled: true,
      order: 5,
      weight: 0,
      mode: 'fill',
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 1,
      colorApplication: 'fill',
      circleRadius: 0.46,
      hatchSpacing: 4,
      hatchAngle: 45,
      noiseAssigned: false,
    },
  ];
}

export function getNoiseAssignableTypes(types: CellTypeDef[]): CellTypeDef[] {
  return types.filter((t) => t.enabled && t.noiseAssigned !== false && t.weight > 0);
}

export function createDefaultCellType(order: number): CellTypeDef {
  return {
    id: createId(),
    name: 'New Type',
    enabled: true,
    order,
    weight: 0.1,
    mode: 'fill',
    fill: '#000000',
    stroke: '#000000',
    strokeWidth: 1,
    colorApplication: 'fill',
    circleRadius: 0.46,
    hatchSpacing: 4,
    hatchAngle: 45,
    noiseAssigned: true,
  };
}

export function normalizeWeights<T extends WeightedItem>(items: T[]): T[] {
  const enabled = items.filter((i) => i.enabled);
  const total = enabled.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return items;
  return items.map((item) =>
    item.enabled ? { ...item, weight: item.weight / total } : item,
  );
}

export function redistributeWeights<T extends WeightedItem>(
  items: T[],
  removedId: string,
): T[] {
  const remaining = items.filter((i) => i.id !== removedId && i.enabled);
  if (remaining.length === 0) return items.filter((i) => i.id !== removedId);
  const removedWeight = items.find((i) => i.id === removedId)?.weight ?? 0;
  const share = removedWeight / remaining.length;
  return normalizeWeights(
    items
      .filter((i) => i.id !== removedId)
      .map((item) =>
        item.enabled ? { ...item, weight: item.weight + share } : item,
      ),
  );
}

export function weightsToThresholds(items: WeightedItem[]): { id: string; threshold: number }[] {
  const sorted = [...items]
    .filter((i) => i.enabled && i.weight > 0)
    .sort((a, b) => a.order - b.order);
  let cumulative = 0;
  return sorted.map((item) => {
    cumulative += item.weight;
    return { id: item.id, threshold: cumulative };
  });
}

export function classifyNoise(value: number, items: WeightedItem[]): string {
  const thresholds = weightsToThresholds(items);
  if (thresholds.length === 0) return items[0]?.id ?? TYPE_IDS.grid;
  for (const t of thresholds) {
    if (value < t.threshold) return t.id;
  }
  return thresholds[thresholds.length - 1].id;
}

export function getCellTypeById(types: CellTypeDef[], id: string): CellTypeDef | undefined {
  return types.find((t) => t.id === id);
}

export function isMeshMode(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'mesh' || type?.mode === 'stroke';
}

export function isSolidLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'fill';
}

export function isCircleLike(type: CellTypeDef | undefined): boolean {
  return type?.mode === 'circle';
}

export function isShapeMass(type: CellTypeDef | undefined): boolean {
  if (!type) return false;
  return isSolidLike(type) || isCircleLike(type);
}

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function reindexOrders<T extends { order: number }>(items: T[]): T[] {
  return sortByOrder(items).map((item, i) => ({ ...item, order: i }));
}

export function needsCellTypeMigration(types: CellTypeDef[]): boolean {
  return types.some((t) => t.id === TYPE_IDS.empty || t.mode === 'none') ||
    !types.some((t) => t.id === TYPE_IDS.gridEdge);
}
