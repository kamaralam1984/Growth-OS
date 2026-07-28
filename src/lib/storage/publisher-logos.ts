import { createFileStore } from "./file-store";
import { compressRasterImage, RASTER_EXTENSION_BY_TYPE, RASTER_CONTENT_TYPE_BY_EXTENSION } from "./image-compression";

/**
 * Local-disk storage for MarketplacePublisher logo uploads — scoped by
 * userId (MarketplacePublisher.userId is unique per user, same posture as
 * User.avatarStorageKey) rather than publisherId, so the file can be
 * uploaded through the same flow regardless of which publisher record it
 * ultimately attaches to. Mirrors avatars.ts's exact pattern.
 */
const store = createFileStore("publisher-logos");

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSION_BY_TYPE = RASTER_EXTENSION_BY_TYPE;

export const PUBLISHER_LOGO_CONTENT_TYPE_BY_EXTENSION = RASTER_CONTENT_TYPE_BY_EXTENSION;

export interface PublisherLogoUploadResult {
  storageKey: string;
}

export async function savePublisherLogo(userId: string, file: File): Promise<PublisherLogoUploadResult> {
  if (file.size === 0) throw new Error("Choose a logo to upload.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Logo must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`);
  }
  const extension = ALLOWED_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG, WebP, GIF, or AVIF.`);
  }

  const original = Buffer.from(await file.arrayBuffer());
  const output = await compressRasterImage(original, extension);

  const storageKey = await store.save(userId, "logo", `logo.${extension}`, output);
  return { storageKey };
}

export async function readPublisherLogo(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function removePublisherLogo(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
