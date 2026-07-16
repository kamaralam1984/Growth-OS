import { prisma } from "@/lib/prisma";
import type { WhiteLabelSettings } from "@/generated/prisma/client";
import { upsertWhiteLabelSettingsSchema, type UpsertWhiteLabelSettingsInput } from "@/lib/validations/white-label";
import { saveWhiteLabelAsset, removeWhiteLabelAsset } from "@/lib/storage/white-label-assets";

export async function getWhiteLabelSettings(organizationId: string): Promise<WhiteLabelSettings | null> {
  return prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
}

/** Real create-or-update — validated via upsertWhiteLabelSettingsSchema before ever touching the row. */
export async function upsertWhiteLabelSettings(
  organizationId: string,
  input: UpsertWhiteLabelSettingsInput,
): Promise<WhiteLabelSettings> {
  const parsed = upsertWhiteLabelSettingsSchema.parse(input);

  return prisma.whiteLabelSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...parsed },
    update: { ...parsed },
  });
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const FAVICON_MAX_BYTES = 512 * 1024;

/** Real content-type allowlist, keyed to the file extension we persist the asset under so the serving route can infer Content-Type without a dedicated mimeType column. */
const ALLOWED_IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

/**
 * Real image upload for the org's logo or favicon — validates the browser-
 * reported content-type is actually an image type we allow, enforces a
 * reasonable size cap per kind, replaces any previous file for that kind
 * on disk (never leaves an orphan), and persists the resulting storage key
 * onto WhiteLabelSettings.
 */
export async function uploadWhiteLabelLogo(
  organizationId: string,
  file: File,
  kind: "logo" | "favicon",
): Promise<{ storageKey: string }> {
  if (file.size === 0) {
    throw new Error("Choose a file to upload.");
  }

  const maxBytes = kind === "logo" ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`${kind === "logo" ? "Logo" : "Favicon"} must be ${Math.round(maxBytes / 1024)}KB or smaller.`);
  }

  const ext = ALLOWED_IMAGE_EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error(`Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG, WebP, GIF, SVG, or ICO.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const existing = await prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
  const previousKey = kind === "logo" ? existing?.logoStorageKey : existing?.faviconStorageKey;
  if (previousKey) {
    await removeWhiteLabelAsset(previousKey);
  }

  const storageKey = await saveWhiteLabelAsset(organizationId, kind, `${kind}.${ext}`, buffer);

  if (kind === "logo") {
    await prisma.whiteLabelSettings.upsert({
      where: { organizationId },
      create: { organizationId, logoStorageKey: storageKey },
      update: { logoStorageKey: storageKey },
    });
  } else {
    await prisma.whiteLabelSettings.upsert({
      where: { organizationId },
      create: { organizationId, faviconStorageKey: storageKey },
      update: { faviconStorageKey: storageKey },
    });
  }

  return { storageKey };
}
