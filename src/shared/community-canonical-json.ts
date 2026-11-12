import canonicalize from 'canonicalize';
import { assertUnicode } from './strict-json';

/** Reject JS-only values before calling the pinned RFC 8785 serializer. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function check(item: unknown, depth: number): void {
    if (depth > 20) throw new Error('Canonical JSON nesting exceeds 20');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item === 'string') {
      assertUnicode(item);
      return;
    }
    if (typeof item !== 'object') throw new Error('Expected JSON data');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new Error('Expected a plain JSON object');
    if (ancestors.has(item)) throw new Error('Cyclic JSON data');
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    if (
      Array.isArray(item) &&
      (keys.length !== item.length + 1 ||
        keys.some(
          (key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)),
        ))
    )
      throw new Error('Sparse or decorated JSON array');
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      if (typeof key !== 'string') throw new Error('Symbol JSON key');
      assertUnicode(key);
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!descriptor.enumerable || !('value' in descriptor))
        throw new Error('Expected enumerable JSON data properties');
      check(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  check(value, 0);
  return canonicalize(value)!;
}

export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
