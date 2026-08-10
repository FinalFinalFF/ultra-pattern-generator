import type { ColorDef, ColorScheme } from './types';
import { createId } from './cellTypes';

export function getDefaultColorSchemes(): ColorScheme[] {
  return [monochromeScheme(), warmScheme(), coolScheme()];
}

function monochromeScheme(): ColorScheme {
  return {
    id: 'monochrome',
    name: 'Monochrome',
    backgroundColor: '#FFFFFF',
    colors: [
      {
        id: 'ink',
        name: 'Ink',
        hex: '#000000',
        enabled: true,
        order: 0,
        weight: 1,
      },
    ],
  };
}

function warmScheme(): ColorScheme {
  return {
    id: 'warm',
    name: 'Warm',
    backgroundColor: '#FFF8F0',
    colors: [
      { id: createId(), name: 'Cream', hex: '#FFF8F0', enabled: true, order: 0, weight: 0.25 },
      { id: createId(), name: 'Peach', hex: '#FFB088', enabled: true, order: 1, weight: 0.25 },
      { id: createId(), name: 'Coral', hex: '#E85D4C', enabled: true, order: 2, weight: 0.25 },
      { id: createId(), name: 'Rust', hex: '#8B2500', enabled: true, order: 3, weight: 0.25 },
    ],
  };
}

function coolScheme(): ColorScheme {
  return {
    id: 'cool',
    name: 'Cool',
    backgroundColor: '#F0F4FF',
    colors: [
      { id: createId(), name: 'Ice', hex: '#E8F0FE', enabled: true, order: 0, weight: 0.25 },
      { id: createId(), name: 'Sky', hex: '#6BA3D6', enabled: true, order: 1, weight: 0.25 },
      { id: createId(), name: 'Navy', hex: '#1A3A5C', enabled: true, order: 2, weight: 0.25 },
      { id: createId(), name: 'Slate', hex: '#4A5568', enabled: true, order: 3, weight: 0.25 },
    ],
  };
}

export function createDefaultColor(order: number): ColorDef {
  return {
    id: createId(),
    name: 'New Color',
    hex: '#888888',
    enabled: true,
    order,
    weight: 0.1,
  };
}

export function createScheme(name: string): ColorScheme {
  return {
    id: createId(),
    name,
    backgroundColor: '#FFFFFF',
    colors: [createDefaultColor(0)],
  };
}

export function getColorById(scheme: ColorScheme, id: string | null): ColorDef | null {
  if (!id) return null;
  return scheme.colors.find((c) => c.id === id) ?? null;
}

export function duplicateScheme(scheme: ColorScheme): ColorScheme {
  return {
    ...scheme,
    id: createId(),
    name: `${scheme.name} Copy`,
    colors: scheme.colors.map((c) => ({ ...c, id: createId() })),
  };
}
