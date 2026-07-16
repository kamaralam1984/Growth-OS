import { createFileStore } from "./file-store";

/**
 * Local-disk storage for the RAG Engine's Document Ingestion pipeline —
 * mirrors src/lib/storage/documents.ts exactly, but as its own bucket
 * (storage/rag-documents/) so ingestion uploads never share a directory
 * (or a delete/rename) with the unrelated CRM/Documents module. Files are
 * only ever read back by the background ingestion worker
 * (src/lib/rag/embedding-queue.ts's processIngestDocument), never served
 * directly to a browser.
 */
const store = createFileStore("rag-documents");

export async function saveRagDocumentFile(
  organizationId: string,
  ingestedDocumentId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(organizationId, ingestedDocumentId, filename, buffer);
}

export async function readRagDocumentFile(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function deleteRagDocumentFile(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
