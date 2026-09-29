import { create } from "zustand";
import { defaultPreferences, readPreferences, savePreferences, storage } from "./storage";
import type { AdminDraft, DemoResult, DemoUser, Placement, Preferences } from "./types";

type AppState = {
  hydrated: boolean;
  user: DemoUser | null;
  results: Record<string, DemoResult>;
  drafts: Record<string, Placement[]>;
  adminDrafts: Record<string, AdminDraft>;
  preferences: Preferences;
  hydrate: () => Promise<void>;
  setUser: (value: DemoUser | null) => Promise<void>;
  setResult: (value: DemoResult) => Promise<void>;
  setDraft: (id: string, placements: Placement[]) => Promise<void>;
  setAdminDraft: (draft: AdminDraft) => Promise<void>;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetDemo: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false, user: null, results: {}, drafts: {}, adminDrafts: {}, preferences: defaultPreferences,
  async hydrate() {
    if (get().hydrated) return;
    const state = await storage.load();
    set({ ...state, preferences: readPreferences(), hydrated: true });
  },
  async setUser(value) { set({ user: value }); await storage.saveUser(value); },
  async setResult(value) { const results = { ...get().results, [value.puzzle_id]: value }; set({ results }); await storage.saveResults(results); },
  async setDraft(id, placements) { const drafts = { ...get().drafts, [id]: placements }; set({ drafts }); await storage.saveDrafts(drafts); },
  async setAdminDraft(draft) { const adminDrafts = { ...get().adminDrafts, [draft.id]: draft }; set({ adminDrafts }); await storage.saveAdminDrafts(adminDrafts); },
  setPreference(key, value) { const preferences = { ...get().preferences, [key]: value }; set({ preferences }); savePreferences(preferences); },
  async resetDemo() { await storage.clear(); set({ user: null, results: {}, drafts: {}, adminDrafts: {}, preferences: defaultPreferences }); savePreferences(defaultPreferences); },
}));
