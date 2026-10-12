import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseLevel } from '../../src/game/levels/parse';
import { validateDocument } from '../../src/game/levels/document';
import type { LevelDocument } from '../../src/game/levels/codec';

export class LibraryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const defaultLibrary = path.resolve(process.cwd(), '../src/game/levels/authored');
const suffix = '.json';
const legacySuffix = '.puttential.json';
const revisionOf = (text: string) => createHash('sha256').update(text).digest('hex');
function slug(name: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name))
    throw new LibraryError('Level ID must be 1–80 lowercase letters, digits or hyphens');
  return name;
}
async function safeDirectory(directory: string) {
  // Reject symlink components, including the library directory itself.
  let current = path.parse(directory).root;
  for (const part of path.relative(current, directory).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new LibraryError('Library path must not contain symlinks');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await mkdir(directory, { recursive: true });
}
async function readRegular(file: string): Promise<string | null> {
  try {
    const stats = await lstat(file);
    if (!stats.isFile() || stats.isSymbolicLink())
      throw new LibraryError('Level files must be regular files');
    if (stats.size > 2_000_000) throw new LibraryError('Level file is too large');
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function filePath(directory: string, name: string, extension: string) {
  return path.join(/* turbopackIgnore: true */ directory, slug(name) + extension);
}
export async function listLevels(directory = defaultLibrary) {
  await safeDirectory(directory);
  return [
    ...new Set(
      (await readdir(directory)).flatMap((name) => {
        const match = /^([a-z0-9][a-z0-9-]{0,79})(?:\.puttential)?\.json$/.exec(name);
        return match ? [match[1]!] : [];
      }),
    ),
  ].sort();
}
async function storedLevel(name: string, directory: string) {
  const json = await readRegular(filePath(directory, name, suffix));
  if (json === null) {
    const legacy = await readRegular(filePath(directory, name, legacySuffix));
    if (legacy === null) return null;
    return {
      document: validateDocument(JSON.parse(legacy)),
      revision: revisionOf(legacy),
      warning:
        'Legacy editor document loaded. Save writes the new game JSON and metadata; the original file is preserved.',
    };
  }
  const level = parseLevel(JSON.parse(json));
  if (level.id !== name) throw new LibraryError('Filename must match the level ID');
  const metadata = await readRegular(filePath(directory, name, '.editor.json'));
  let document = validateDocument(level),
    warning = '';
  if (metadata !== null) {
    const data = JSON.parse(metadata);
    if (data.levelRevision === revisionOf(json))
      document = validateDocument({ version: data.version, level, editor: data.editor });
    else
      warning =
        'Level JSON changed independently of editor metadata. Bounds were recalculated from the level; inspect them before saving.';
  }
  return { document, revision: revisionOf(json + '\n' + (metadata ?? '')), warning };
}
export async function loadLevel(name: string, directory = defaultLibrary) {
  await safeDirectory(directory);
  const result = await storedLevel(slug(name), directory);
  if (!result) throw new LibraryError('Level not found', 404);
  return result;
}
async function atomicWrite(file: string, text: string) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function saveLevel(
  value: unknown,
  revision: string | null,
  directory = defaultLibrary,
) {
  const document: LevelDocument = validateDocument(value);
  const name = slug(document.level.id);
  await safeDirectory(directory);
  const file = filePath(directory, name, suffix),
    metadataFile = filePath(directory, name, '.editor.json');
  const lock = path.join(/* turbopackIgnore: true */ directory, name + '.lock');
  let handle;
  try {
    handle = await open(lock, 'wx');
  } catch {
    throw new LibraryError('This level is being saved. Retry shortly.', 409);
  }
  try {
    const previous = await storedLevel(name, directory);
    if ((previous?.revision ?? null) !== revision)
      throw new LibraryError(
        'This level already exists or changed on disk. Reopen it, or choose a new level ID to Save As.',
        409,
      );
    if (previous) {
      const before = { ...previous.document.level, version: 0 },
        after = { ...document.level, version: 0 };
      const minimum =
        previous.document.level.version +
        (JSON.stringify(before) === JSON.stringify(after) ? 0 : 1);
      document.level.version = Math.max(document.level.version, minimum);
    }
    const level = parseLevel(document.level);
    const text = JSON.stringify(level, null, 2) + '\n';
    const metadata =
      JSON.stringify(
        { version: 2, levelRevision: revisionOf(text), editor: document.editor },
        null,
        2,
      ) + '\n';
    // Metadata is bound to this exact JSON hash. JSON replacement is the commit point;
    // if interrupted between renames, load ignores mismatched metadata with a visible warning.
    await readRegular(metadataFile); // Reject a symlink or non-file before replacement.
    await atomicWrite(metadataFile, metadata);
    await atomicWrite(file, text);
    return {
      document: { ...document, level },
      revision: revisionOf(text + '\n' + metadata),
      path: `src/game/levels/authored/${name}.json`,
    };
  } finally {
    await handle.close();
    await unlink(lock).catch(() => {});
  }
}
