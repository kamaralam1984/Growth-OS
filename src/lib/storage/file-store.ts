import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";

import { encryptBufferWithKey, decryptBufferWithKey } from "@/lib/crypto/aes-gcm";

/**
 * Shared local-disk file store factory — no S3/Blob credentials exist in
 * this environment. Each caller gets its own subdirectory under
 * <project root>/storage/, never under public/, and files are only ever
 * meant to be read back through an auth-gated route handler (or a signed
 * URL, see signed-url.ts). Extracted out of src/lib/storage/documents.ts so
 * the same on-disk save/read/delete logic can be reused for
 * ProjectFileVersion storage (storage/project-files/) without duplicating it.
 *
 * At-rest encryption is opt-in via FILE_STORAGE_ENCRYPTION_KEY: if unset,
 * behavior is unchanged (plaintext on disk) so existing deployments never
 * break. If set, every new save() is AES-256-GCM encrypted with a 7-byte
 * magic prefix ("KVLENC1") so read() can tell an encrypted file from a
 * pre-existing plaintext one written before the key was configured — never a
 * destructive rewrite of files already on disk.
 */
const ENC_MAGIC = Buffer.from("KVLENC1", "ascii");

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 150) || "file";
}

function encryptionKey(): string | undefined {
  return process.env.FILE_STORAGE_ENCRYPTION_KEY;
}

export interface FileStore {
  save(scopeId: string, entityId: string, filename: string, buffer: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

/**
 * `resolved.startsWith(storageRoot)` alone would also accept a sibling
 * directory that merely shares storageRoot as a string prefix (e.g.
 * storageRoot `.../storage/documents` would pass for a resolved path under
 * `.../storage/documents-evil/`) — require the exact root or root+separator
 * so containment is real, not just textual.
 */
function isWithinRoot(resolved: string, root: string): boolean {
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function createFileStore(subdir: string): FileStore {
  const storageRoot = path.join(process.cwd(), "storage", subdir);

  return {
    async save(scopeId, entityId, filename, buffer) {
      const dir = path.join(storageRoot, scopeId);
      await mkdir(dir, { recursive: true });
      const storageKey = path.join(scopeId, `${entityId}-${sanitizeFilename(filename)}`);
      const key = encryptionKey();
      const onDisk = key ? Buffer.concat([ENC_MAGIC, encryptBufferWithKey(buffer, key)]) : buffer;
      await writeFile(path.join(storageRoot, storageKey), onDisk);
      return storageKey;
    },

    async read(storageKey) {
      const resolved = path.join(storageRoot, storageKey);
      if (!isWithinRoot(resolved, storageRoot)) {
        throw new Error("Invalid storage key.");
      }
      const raw = await readFile(resolved);
      if (raw.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) {
        const key = encryptionKey();
        if (!key) {
          throw new Error("This file was saved encrypted but FILE_STORAGE_ENCRYPTION_KEY is not set — cannot decrypt.");
        }
        return decryptBufferWithKey(raw.subarray(ENC_MAGIC.length), key);
      }
      return raw;
    },

    async remove(storageKey) {
      const resolved = path.join(storageRoot, storageKey);
      if (!isWithinRoot(resolved, storageRoot)) return;
      await unlink(resolved).catch(() => {});
    },
  };
}
