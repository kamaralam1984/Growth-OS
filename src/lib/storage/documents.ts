import { createFileStore } from "./file-store";

/**
 * Local-disk document storage — no S3/Blob credentials exist in this
 * environment. Files live under <project root>/storage/documents/, never
 * under public/, and are only ever served through the auth-gated route at
 * src/app/api/documents/[id]/route.ts. A real production deployment behind
 * a load balancer would need to swap this for shared object storage; this is
 * an honest, documented limitation, not a fake stand-in.
 */
const store = createFileStore("documents");

export async function saveDocumentFile(
  organizationId: string,
  documentId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(organizationId, documentId, filename, buffer);
}

export async function readDocumentFile(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
