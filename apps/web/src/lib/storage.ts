import { openDB } from "idb";
import type { AdminDraft, DemoResult, DemoUser, Placement, Preferences } from "./types";

export type PersistedState = {
  user: DemoUser | null;
  results: Record<string, DemoResult>;
  drafts: Record<string, Placement[]>;
  adminDrafts: Record<string, AdminDraft>;
};
const memory = new Map<string, unknown>();
const dbPromise = typeof window === "undefined" ? null : openDB("puttential-demo", 1, {
  upgrade(db) { if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv"); },
});
async function read<T>(key: string, fallback: T): Promise<T> {
  try { return ((await dbPromise?.then((db) => db.get("kv", key))) ?? memory.get(key) ?? fallback) as T; }
  catch { return (memory.get(key) ?? fallback) as T; }
}
async function write<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  try { await dbPromise?.then((db) => db.put("kv", value, key)); } catch { /* Private browsing still works for this tab. */ }
}
export const storage = {
  async load(): Promise<PersistedState> {
    return {
      user: await read<DemoUser | null>("user", null),
      results: await read<Record<string, DemoResult>>("results", {}),
      drafts: await read<Record<string, Placement[]>>("drafts", {}),
      adminDrafts: await read<Record<string, AdminDraft>>("adminDrafts", {}),
    };
  },
  saveUser: (value: DemoUser | null) => write("user", value),
  saveResults: (value: Record<string, DemoResult>) => write("results", value),
  saveDrafts: (value: Record<string, Placement[]>) => write("drafts", value),
  saveAdminDrafts: (value: Record<string, AdminDraft>) => write("adminDrafts", value),
  async clear() {
    memory.clear();
    try { await dbPromise?.then((db) => db.clear("kv")); } catch { /* In-memory state still resets. */ }
  },
};
export const defaultPreferences: Preferences = { grid: false, coordinates: false, reducedMotion: false, labels: true };
export function readPreferences(): Preferences {
  if (typeof window === "undefined") return defaultPreferences;
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem("puttential-preferences") ?? "{}") }; }
  catch { return defaultPreferences; }
}
export function savePreferences(value: Preferences) {
  try { localStorage.setItem("puttential-preferences", JSON.stringify(value)); } catch { /* Optional preference persistence. */ }
}
