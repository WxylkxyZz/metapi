export type SortField = 'balance' | 'status';
export type SortMode = 'custom' | `${SortField}-asc` | `${SortField}-desc`;

export type SortValue = number | string | null | undefined;

type SortableBase = {
  id: number;
  isPinned?: boolean | null;
  sortOrder?: number | null;
};

export function sortFieldOf(mode: SortMode): SortField | undefined {
  if (mode === 'custom') return undefined;
  const idx = mode.lastIndexOf('-');
  return mode.slice(0, idx) as SortField;
}

function compareSortValues(a: SortValue, b: SortValue): number {
  const aNum = typeof a === 'number' && Number.isFinite(a);
  const bNum = typeof b === 'number' && Number.isFinite(b);
  if (aNum && bNum) return a - b;
  if (aNum) return -1; // numeric before string/null
  if (bNum) return 1;
  const aStr = typeof a === 'string' && a.length > 0 ? a : '￿'; // null/empty -> last
  const bStr = typeof b === 'string' && b.length > 0 ? b : '￿';
  return aStr.localeCompare(bStr);
}

export function sortItemsForDisplay<T extends SortableBase>(
  items: T[],
  mode: SortMode,
  getValue: (item: T, mode: SortMode) => SortValue,
): T[] {
  const list = [...items];
  const customComparator = (a: T, b: T) => {
    const aPinned = a.isPinned ? 1 : 0;
    const bPinned = b.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aOrder = Number.isFinite(a.sortOrder as number) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.sortOrder as number) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.id - b.id;
  };

  if (mode === 'custom') {
    return list.sort(customComparator);
  }

  const direction = mode.endsWith('-desc') ? -1 : 1;
  return list.sort((a, b) => {
    const aPinned = a.isPinned ? 1 : 0;
    const bPinned = b.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const cmp = compareSortValues(getValue(a, mode), getValue(b, mode));
    if (cmp !== 0) return direction * cmp;

    return customComparator(a, b);
  });
}

export function buildCustomReorderUpdates<T extends SortableBase>(
  items: T[],
  targetId: number,
  direction: 'up' | 'down',
): Array<{ id: number; sortOrder: number }> {
  const sorted = sortItemsForDisplay(items, 'custom', () => 0);
  const target = sorted.find((item) => item.id === targetId);
  if (!target) return [];

  const targetPinned = !!target.isPinned;
  const group = sorted.filter((item) => !!item.isPinned === targetPinned);
  const index = group.findIndex((item) => item.id === targetId);
  if (index < 0) return [];

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= group.length) return [];

  const next = [...group];
  const temp = next[index];
  next[index] = next[swapIndex];
  next[swapIndex] = temp;

  const updates: Array<{ id: number; sortOrder: number }> = [];
  next.forEach((item, idx) => {
    const prev = Number.isFinite(item.sortOrder as number) ? Number(item.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (prev !== idx) {
      updates.push({ id: item.id, sortOrder: idx });
    }
  });

  return updates;
}