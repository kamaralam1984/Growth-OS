import { createFileStore } from "./file-store";
import { compressRasterImage, RASTER_EXTENSION_BY_TYPE, RASTER_CONTENT_TYPE_BY_EXTENSION } from "./image-compression";

/**
 * Local-disk storage for user profile-photo uploads — same documented
 * limitation as white-label-assets.ts (no S3/Blob credentials in this
 * environment). Files live under <project root>/storage/avatars/, never
 * under public/, served back through src/app/api/users/[id]/avatar/route.ts.
 */
const store = createFileStore("avatars");

// Real hard cap, matching the product brief.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Raster formats only (no SVG — same XSS reasoning as
 * white-label/settings.ts's ALLOWED_IMAGE_EXTENSION_BY_TYPE: an SVG can
 * embed a <script>/event-handler that executes on direct navigation to the
 * raw asset URL). Keyed to the extension we persist under, matching the
 * uploaded format 1:1 — this module never force-converts a format.
 */
const ALLOWED_EXTENSION_BY_TYPE = RASTER_EXTENSION_BY_TYPE;

export const AVATAR_CONTENT_TYPE_BY_EXTENSION = RASTER_CONTENT_TYPE_BY_EXTENSION;

export interface AvatarUploadResult {
  storageKey: string;
}

/**
 * Real validation + real compression (src/lib/storage/image-compression.ts)
 * + real on-disk save for a user's profile photo.
 */
export async function saveUserAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  if (file.size === 0) {
    throw new Error("Choose a photo to upload.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Photo must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`);
  }

  const extension = ALLOWED_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG, WebP, GIF, or AVIF.`);
  }

  const original = Buffer.from(await file.arrayBuffer());
  const output = await compressRasterImage(original, extension);

  const storageKey = await store.save(userId, "avatar", `avatar.${extension}`, output);
  return { storageKey };
}

export async function readUserAvatar(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function removeUserAvatar(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
