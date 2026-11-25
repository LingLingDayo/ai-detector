export function importHistoryItems<T extends { id: string; createdAt?: number; updatedAt?: number }>(
  current: readonly T[],
  incoming: readonly T[],
  mode: "merge" | "overwrite",
  persist: (next: T[]) => void,
  getTimestamp: (item: T) => number = (item) => item.createdAt || 0
): { next: T[]; added: number; skipped: number } {
  const list = Array.isArray(incoming) ? incoming : [];
  if (mode === "overwrite") {
    const seen = new Set<string>();
    const next: T[] = [];
    for (const item of list) {
      if (!item || typeof item.id !== "string" || seen.has(item.id)) continue;
      seen.add(item.id);
      next.push(item);
    }
    next.sort((a, b) => getTimestamp(b) - getTimestamp(a));
    persist(next);
    return { next, added: next.length, skipped: 0 };
  }

  const existingIds = new Set(current.map((item) => item.id));
  const addedItems: T[] = [];
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item.id !== "string") continue;
    if (existingIds.has(item.id)) {
      skipped += 1;
      continue;
    }
    existingIds.add(item.id);
    addedItems.push(item);
  }
  const next = [...addedItems, ...current].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  persist(next);
  return { next, added: addedItems.length, skipped };
}
