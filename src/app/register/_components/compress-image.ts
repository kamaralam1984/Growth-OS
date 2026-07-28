/**
 * Real client-side image compression — shrinks a large photo before it's
 * even sent over the wire, using the browser's own canvas encoder (no
 * external library). Only re-encodes PNG/JPEG/WebP, since canvas.toBlob()
 * can't preserve GIF animation frames or encode AVIF — those pass through
 * untouched and rely on the server-side sharp pass in
 * src/lib/storage/avatars.ts instead. The result is only kept if it's
 * actually smaller than the original; otherwise the original file is used.
 */

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

const COMPRESS_ABOVE_BYTES = 400 * 1024;
const MAX_DIMENSION_PX = 1600;
const CANVAS_RECODABLE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (file.size <= COMPRESS_ABOVE_BYTES) return file;
  if (!CANVAS_RECODABLE_TYPES.includes(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.82));
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name, { type: file.type });
}
