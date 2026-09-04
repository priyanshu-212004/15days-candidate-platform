/**
 * A reorder request is only valid if it's a complete permutation of the
 * interview's own question ids — no partial lists, no foreign ids, no
 * duplicates smuggled in.
 */
export function isValidReorderPermutation(existingIds: string[], requestedIds: string[]): boolean {
  if (requestedIds.length !== existingIds.length) return false;
  const existingSet = new Set(existingIds);
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (!existingSet.has(id)) return false;
    if (seen.has(id)) return false; // reject duplicates
    seen.add(id);
  }
  return true;
}

/** Assigns contiguous zero-based order values matching array position. */
export function renumber<T extends { id: string }>(items: T[]): (T & { order: number })[] {
  return items.map((item, index) => ({ ...item, order: index }));
}
