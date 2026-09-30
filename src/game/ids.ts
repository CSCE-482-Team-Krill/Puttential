/** Sorts by code unit rather than locale, so every runtime iterates objects identically. */
export function sortById<T extends Readonly<{ id: string }>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
