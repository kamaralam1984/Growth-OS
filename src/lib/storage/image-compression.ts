import sharp, { type Sharp } from "sharp";

/**
 * Shared server-side raster-image compression — extracted from avatars.ts so
 * org-assets.ts (organization/company logos, banners, portfolio/case-study
 * images) can reuse the exact same real compression behavior instead of a
 * second copy. Re-encodes in the SAME format it was given (PNG stays PNG,
 * JPEG stays JPEG, ...) and only resizes/recompresses when the file is large
 * enough that doing so meaningfully helps — a small image is returned
 * untouched. Animated GIF/WebP go through sharp with `animated: true` so
 * every frame survives the resize instead of collapsing to a single static
 * frame.
 */

export const COMPRESS_ABOVE_BYTES = 400 * 1024;
export const MAX_DIMENSION_PX = 1600;

export const RASTER_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const RASTER_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

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
 * Compresses a raster image buffer if it's large enough to benefit, keeping
 * its original format. Returns the original buffer untouched if it's small,
 * if compression fails (corrupt/unsupported bytes), or if the recompressed
 * result isn't actually smaller.
 */
export async function compressRasterImage(original: Buffer, extension: string): Promise<Buffer> {
  if (original.byteLength <= COMPRESS_ABOVE_BYTES) return original;

  try {
    const image = sharp(original, { animated: true }).resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
      withoutEnlargement: true,
    });
    const recompressed = Buffer.from(await reencodeSameFormat(image, extension));
    return recompressed.byteLength < original.byteLength ? recompressed : original;
  } catch (error) {
    console.error("[image-compression] compression failed, returning original bytes:", error);
    return original;
  }
}
