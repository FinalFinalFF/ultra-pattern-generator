import type { CellTypeDef } from './types';
import { TYPE_IDS } from './types';
import { LOGO_SVG_MARKUP, LOGO_SVG_VIEWBOX } from './logoCell';

const svgImageCache = new Map<string, HTMLImageElement>();

export function svgMarkupForType(type: CellTypeDef): string | undefined {
  if (type.svgMarkup) return type.svgMarkup;
  if (type.id === TYPE_IDS.logo) return LOGO_SVG_MARKUP;
  return undefined;
}

export function svgViewBoxForType(type: CellTypeDef): string {
  if (type.svgViewBox) return type.svgViewBox;
  if (type.id === TYPE_IDS.logo) return LOGO_SVG_VIEWBOX;
  return '0 0 100 100';
}

export function parseSvgUpload(
  file: File,
  type: CellTypeDef,
): Promise<{ symbolId: string; innerMarkup: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) {
          reject(new Error('Invalid SVG'));
          return;
        }
        const symbolId = `symbol-${type.id}`;
        const inner = svg.innerHTML;
        const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
        resolve({ symbolId, innerMarkup: inner, dataUrl });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function loadSvgIntoCache(symbolId: string, dataUrl: string): Promise<HTMLImageElement> {
  const existing = svgImageCache.get(symbolId);
  if (existing?.complete) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      svgImageCache.set(symbolId, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load SVG image'));
    img.src = dataUrl;
  });
}

export function getSvgCache(): Map<string, HTMLImageElement> {
  return svgImageCache;
}

export function preloadTypeSvgs(types: CellTypeDef[]): Promise<unknown[]> {
  const promises = types
    .filter((t) => t.mode === 'svg' && t.svgSymbolId && svgMarkupForType(t))
    .map((t) => {
      const markup = svgMarkupForType(t)!;
      const dataUrl =
        'data:image/svg+xml;base64,' +
        btoa(
          unescape(
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svgViewBoxForType(t)}">${markup}</svg>`,
            ),
          ),
        );
      return loadSvgIntoCache(t.svgSymbolId!, dataUrl);
    });
  return Promise.all(promises);
}

export function estimateStorageSize(types: CellTypeDef[]): number {
  return types.reduce((sum, t) => sum + (t.svgMarkup?.length ?? 0), 0);
}

export function warnIfStorageLarge(types: CellTypeDef[]): void {
  const size = estimateStorageSize(types);
  if (size > 4_000_000) {
    console.warn('SVG symbol storage approaching localStorage limit');
  }
}
