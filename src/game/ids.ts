/** Locale-independent ordering, so every runtime iterates objects identically. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortById<T extends Readonly<{ id: string }>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareIds(a.id, b.id));
}
