import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Shared local-disk file store factory — no S3/Blob credentials exist in
 * this environment. Each caller gets its own subdirectory under
 * <project root>/storage/, never under public/, and files are only ever
 * meant to be read back through an auth-gated route handler. Extracted out
 * of src/lib/storage/documents.ts so the same on-disk save/read/delete
 * logic can be reused for ProjectFileVersion storage (storage/project-files/)
 * without duplicating it.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 150) || "file";
}

export interface FileStore {
  save(scopeId: string, entityId: string, filename: string, buffer: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

export function createFileStore(subdir: string): FileStore {
  const storageRoot = path.join(process.cwd(), "storage", subdir);

  return {
    async save(scopeId, entityId, filename, buffer) {
      const dir = path.join(storageRoot, scopeId);
      await mkdir(dir, { recursive: true });
      const storageKey = path.join(scopeId, `${entityId}-${sanitizeFilename(filename)}`);
      await writeFile(path.join(storageRoot, storageKey), buffer);
      return storageKey;
    },

    async read(storageKey) {
      const resolved = path.join(storageRoot, storageKey);
      if (!resolved.startsWith(storageRoot)) {
        throw new Error("Invalid storage key.");
      }
      return readFile(resolved);
    },

    async remove(storageKey) {
      const resolved = path.join(storageRoot, storageKey);
      if (!resolved.startsWith(storageRoot)) return;
      await unlink(resolved).catch(() => {});
    },
  };
}
