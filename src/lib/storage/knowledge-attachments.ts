import { createFileStore } from "./file-store";

/**
 * Local-disk storage for Knowledge Base article attachments — mirrors
 * src/lib/storage/documents.ts exactly. Files live under
 * <project root>/storage/knowledge-attachments/, never under public/, and
 * are only ever served through the auth-gated route at
 * src/app/api/knowledge-attachments/[id]/route.ts.
 */
const store = createFileStore("knowledge-attachments");

export async function saveKnowledgeAttachment(
  articleId: string,
  attachmentId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(articleId, attachmentId, filename, buffer);
}

export async function readKnowledgeAttachment(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function deleteKnowledgeAttachmentFile(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
