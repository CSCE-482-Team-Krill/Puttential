import type { LevelDocument } from '../game/levels/codec';

export type StoredEditorDocument = { document: LevelDocument; revision: string; warning?: string };
export type RecoveredEditorDocument = { document: LevelDocument; revision: string | null };
/** Browser capabilities only. Repository filesystem/Prisma modules never enter this interface. */
export interface EditorPersistence {
  list(): Promise<string[]>;
  load(id: string): Promise<StoredEditorDocument>;
  save(
    document: LevelDocument,
    revision: string | null,
  ): Promise<StoredEditorDocument & { path?: string }>;
  importFile(file: File): Promise<LevelDocument>;
  recovery: {
    read():
      | LevelDocument
      | RecoveredEditorDocument
      | null
      | Promise<LevelDocument | RecoveredEditorDocument | null>;
    write(document: LevelDocument): void | Promise<void>;
  };
  labels: { save: string; saved: string; library: string; starters: string };
  starters: readonly { id: string; label: string; load(): LevelDocument }[];
}
