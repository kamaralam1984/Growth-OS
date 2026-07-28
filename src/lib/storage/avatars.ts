import sharp, { type Sharp } from "sharp";

import { createFileStore } from "./file-store";

/**
 * Local-disk storage for user profile-photo uploads — same documented
 * limitation as white-label-assets.ts (no S3/Blob credentials in this
 * environment). Files live under <project root>/storage/avatars/, never
 * under public/, served back through src/app/api/users/[id]/avatar/route.ts.
 */
const store = createFileStore("avatars");

// Real hard cap, matching the product brief.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Above this, re-encode to shrink — most real phone-camera photos (5-15MB)
// land here; small/already-small images are saved as-is.
const COMPRESS_ABOVE_BYTES = 400 * 1024;
const MAX_DIMENSION_PX = 1600;

/**
 * Raster formats only (no SVG — same XSS reasoning as
 * white-label/settings.ts's ALLOWED_IMAGE_EXTENSION_BY_TYPE: an SVG can
 * embed a <script>/event-handler that executes on direct navigation to the
 * raw asset URL). Keyed to the extension we persist under, matching the
 * uploaded format 1:1 — this module never force-converts a format.
 */
const ALLOWED_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const AVATAR_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export interface AvatarUploadResult {
  storageKey: string;
}

async function reencodeSameFormat(image: Sharp, extension: string): Promise<Buffer> {
  switch (extension) {
    case "png":
      return image.png({ compressionLevel: 9 }).toBuffer();
    case "jpg":
      return image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    case "webp":
      return image.webp({ quality: 82 }).toBuffer();
    case "gif":
      return image.gif().toBuffer();
    case "avif":
      return image.avif({ quality: 60 }).toBuffer();
    default:
      return image.toBuffer();
  }
}

/**
 * Real validation + real compression (sharp) + real on-disk save for a
 * user's profile photo. Re-encodes in the SAME format it was uploaded in
 * (PNG stays PNG, JPEG stays JPEG, ...) rather than forcing a single output
 * format, and only resizes/recompresses when the file is large enough that
 * doing so meaningfully helps — a small image is saved untouched. Animated
 * GIF/WebP go through sharp with `animated: true` so every frame survives
 * the resize instead of collapsing to a single static frame. Any genuine
 * compression failure (corrupt/unsupported bytes sharp can't parse) falls
 * back to saving the original bytes rather than failing the whole upload.
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
  let output = original;

  if (original.byteLength > COMPRESS_ABOVE_BYTES) {
    try {
      const image = sharp(original, { animated: true }).resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      });
      const recompressed = Buffer.from(await reencodeSameFormat(image, extension));
      // Only keep the recompressed version if it's actually smaller —
      // a tiny/already-optimized source shouldn't get a bigger file back.
      if (recompressed.byteLength < original.byteLength) output = recompressed;
    } catch (error) {
      console.error("[avatars] compression failed, saving original bytes:", error);
    }
  }

  const storageKey = await store.save(userId, "avatar", `avatar.${extension}`, output);
  return { storageKey };
}

export async function readUserAvatar(storageKey: string): Promise<Buffer> {
  return store.read(storageKey);
}

export async function removeUserAvatar(storageKey: string): Promise<void> {
  return store.remove(storageKey);
}
