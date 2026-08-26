const STORAGE_KEY = 'gridPatternSaves';
const MAX_SAVES = 48;

export interface SavedPattern {
  id: string;
  createdAt: number;
  seed: string;
  svg: string;
}

export function loadSavedPatterns(): SavedPattern[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedPattern);
  } catch {
    return [];
  }
}

function isSavedPattern(value: unknown): value is SavedPattern {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedPattern>;
  return (
    typeof item.id === 'string' &&
    typeof item.createdAt === 'number' &&
    typeof item.seed === 'string' &&
    typeof item.svg === 'string'
  );
}

function persist(items: SavedPattern[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function savePattern(seed: string, svg: string): SavedPattern {
  const item: SavedPattern = {
    id: `save-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    createdAt: Date.now(),
    seed,
    svg,
  };
  const next = [item, ...loadSavedPatterns()].slice(0, MAX_SAVES);
  persist(next);
  return item;
}

export function deleteSavedPattern(id: string): SavedPattern[] {
  const next = loadSavedPatterns().filter((item) => item.id !== id);
  persist(next);
  return next;
}

export function reorderSavedPatterns(ids: string[]): SavedPattern[] {
  const byId = new Map(loadSavedPatterns().map((item) => [item.id, item]));
  const next = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  persist(next);
  return next;
}
