import { createFileStore } from "./file-store";

/**
 * Local-disk storage for white-label logo/favicon uploads — same
 * documented limitation as src/lib/storage/documents.ts (no S3/Blob
 * credentials in this environment; a real multi-instance production
 * deployment would need shared object storage). Files live under
 * <project root>/storage/white-label-assets/, never under public/, and are
 * only ever served through the auth-gated route at
 * src/app/api/white-label/assets/[organizationId]/[kind]/route.ts.
 */
const store = createFileStore("white-label-assets");

export async function saveWhiteLabelAsset(
  organizationId: string,
  entityId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(organizationId, entityId, filename, buffer);
}

export async function readWhiteLabelAsset(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function removeWhiteLabelAsset(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
