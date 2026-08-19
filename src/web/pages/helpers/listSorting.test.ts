import { describe, expect, it } from 'vitest';
import { buildCustomReorderUpdates, sortItemsForDisplay, type SortMode } from './listSorting.js';

type Item = {
  id: number;
  isPinned?: boolean | null;
  sortOrder?: number | null;
  balance?: number | null;
  status?: string | null;
};

function ids(items: Item[]): number[] {
  return items.map((item) => item.id);
}

describe('sortItemsForDisplay', () => {
  const base: Item[] = [
    { id: 1, isPinned: false, sortOrder: 2, balance: 5 },
    { id: 2, isPinned: true, sortOrder: 1, balance: 1 },
    { id: 3, isPinned: false, sortOrder: 0, balance: 20 },
    { id: 4, isPinned: true, sortOrder: 0, balance: 10 },
  ];

  it('keeps pinned items first in custom mode', () => {
    const mode: SortMode = 'custom';
    const sorted = sortItemsForDisplay(base, mode, (item) => item.balance || 0);
    expect(ids(sorted)).toEqual([4, 2, 3, 1]);
  });

  it('sorts by balance desc while keeping pinned items first', () => {
    const sorted = sortItemsForDisplay(base, 'balance-desc', (item) => item.balance || 0);
    expect(ids(sorted)).toEqual([4, 2, 3, 1]);
  });

  it('sorts by balance asc while keeping pinned items first', () => {
    const sorted = sortItemsForDisplay(base, 'balance-asc', (item) => item.balance || 0);
    expect(ids(sorted)).toEqual([2, 4, 1, 3]);
  });
});

describe('sortItemsForDisplay status sorting', () => {
  const ACCOUNT_STATUS_RANK: Record<string, number> = { active: 0, disabled: 1, expired: 2 };

  const accounts: Item[] = [
    { id: 10, isPinned: false, sortOrder: 0, balance: 5, status: 'expired' },
    { id: 11, isPinned: true, sortOrder: 0, balance: 1, status: 'disabled' },
    { id: 12, isPinned: false, sortOrder: 1, balance: 20, status: 'active' },
    { id: 13, isPinned: true, sortOrder: 1, balance: 10, status: 'active' },
    { id: 14, isPinned: false, sortOrder: 2, balance: 15 },
  ];

  const statusValue = (item: Item) => ACCOUNT_STATUS_RANK[item.status ?? ''] ?? 99;

  it('orders active < disabled < expired while keeping pinned first', () => {
    const sorted = sortItemsForDisplay(accounts, 'status-asc', statusValue);
    // pinned first: id 13 (active) then id 11 (disabled)
    // then unpinned: id 12 (active), id 10 (expired), id 14 (unknown status last)
    expect(ids(sorted)).toEqual([13, 11, 12, 10, 14]);
  });

  it('orders status desc (expired first) while keeping pinned first', () => {
    const sorted = sortItemsForDisplay(accounts, 'status-desc', statusValue);
    // pinned first: id 11 (disabled) then id 13 (active)
    // then unpinned: unknown status (99) sorts first, then id 10 (expired), id 12 (active)
    expect(ids(sorted)).toEqual([11, 13, 14, 10, 12]);
  });

  it('falls back to customComparator on status ties', () => {
    const tieItems: Item[] = [
      { id: 30, isPinned: false, sortOrder: 2, status: 'active' },
      { id: 31, isPinned: false, sortOrder: 1, status: 'active' },
      { id: 32, isPinned: false, sortOrder: 0, status: 'active' },
    ];
    const sorted = sortItemsForDisplay(tieItems, 'status-asc', statusValue);
    // all same status -> tie broken by sortOrder (then id)
    expect(ids(sorted)).toEqual([32, 31, 30]);
  });
});

describe('buildCustomReorderUpdates', () => {
  const list: Item[] = [
    { id: 10, isPinned: true, sortOrder: 0 },
    { id: 11, isPinned: true, sortOrder: 1 },
    { id: 20, isPinned: false, sortOrder: 0 },
    { id: 21, isPinned: false, sortOrder: 1 },
  ];

  it('reorders only inside the same pinned group', () => {
    const updates = buildCustomReorderUpdates(list, 20, 'up');
    // First unpinned item cannot move above pinned group.
    expect(updates).toEqual([]);
  });

  it('returns normalized sortOrder updates after moving down', () => {
    const updates = buildCustomReorderUpdates(list, 20, 'down');
    expect(updates).toEqual([
      { id: 21, sortOrder: 0 },
      { id: 20, sortOrder: 1 },
    ]);
  });
});
