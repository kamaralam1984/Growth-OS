import { createFileStore } from "./file-store";

/**
 * Local-disk storage for generated PlatformInvoice PDFs — mirrors
 * src/lib/storage/documents.ts exactly, but under its own subdirectory
 * (storage/platform-invoices/) and scoped by organizationId, keeping
 * platform-billing PDFs completely separate from the pre-existing
 * client-facing Invoice/BusinessDocument storage. Files are only ever meant
 * to be served through an auth-gated route (mirroring
 * src/app/api/documents/[id]/route.ts's pattern), never directly under
 * public/.
 */
const store = createFileStore("platform-invoices");

export async function savePlatformInvoiceFile(
  organizationId: string,
  invoiceId: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  return store.save(organizationId, invoiceId, filename, buffer);
}

export async function readPlatformInvoiceFile(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function deletePlatformInvoiceFile(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
