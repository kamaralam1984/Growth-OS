import { createFileStore } from "./file-store";

/**
 * Local-disk storage for versioned ProjectFile uploads — same convention as
 * src/lib/storage/documents.ts, just a distinct subdirectory
 * (storage/project-files/, never under public/) so a ProjectFileVersion's
 * storageKey can never collide with a Document's. Only ever read through
 * the auth-gated route at src/app/api/project-files/[versionId]/route.ts.
 */
const store = createFileStore("project-files");

export async function saveProjectFileVersion(
  organizationId: string,
  versionEntityId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(organizationId, versionEntityId, filename, buffer);
}

export async function readProjectFileVersion(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function deleteProjectFileVersion(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
