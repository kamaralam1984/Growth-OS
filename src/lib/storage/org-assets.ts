import { randomUUID } from "node:crypto";

import { createFileStore } from "./file-store";
import { compressRasterImage, RASTER_EXTENSION_BY_TYPE, RASTER_CONTENT_TYPE_BY_EXTENSION } from "./image-compression";

/**
 * Generic organization-scoped asset storage — backs every "paste an image
 * URL" field this app has for Organization/Company records (logo, banner,
 * portfolio/case-study images) plus document uploads (certificate files),
 * replacing free-text URL inputs with real uploads. One bucket, one
 * serving route (src/app/api/organizations/[organizationId]/assets/[assetKey]/route.ts)
 * for both kinds — no per-field DB column needed, since these fields already
 * just store a URL string; this module returns its own serving URL in place
 * of whatever external URL a user might otherwise have pasted.
 */
const store = createFileStore("org-assets");

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED_DOCUMENT_EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
};

export const ORG_ASSET_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ...RASTER_CONTENT_TYPE_BY_EXTENSION,
  pdf: "application/pdf",
};

export interface OrgAssetUploadResult {
  url: string;
}

function assetUrl(organizationId: string, assetId: string, extension: string): string {
  return `/api/organizations/${organizationId}/assets/${assetId}.${extension}`;
}

/** Real validation + real compression (raster only) + real on-disk save, keyed under the organization so the serving route can enforce same-org access. */
export async function saveOrgImage(organizationId: string, file: File): Promise<OrgAssetUploadResult> {
  if (file.size === 0) throw new Error("Choose an image to upload.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image must be ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`);
  }
  const extension = RASTER_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG, WebP, GIF, or AVIF.`);
  }

  const original = Buffer.from(await file.arrayBuffer());
  const output = await compressRasterImage(original, extension);

  const assetId = randomUUID();
  await store.save(organizationId, assetId, `asset.${extension}`, output);
  return { url: assetUrl(organizationId, assetId, extension) };
}

/** Real validation + real on-disk save for a document upload (e.g. a certificate PDF) — no compression, documents aren't re-encoded. */
export async function saveOrgDocument(organizationId: string, file: File): Promise<OrgAssetUploadResult> {
  if (file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB or smaller.`);
  }
  const extension = ALLOWED_DOCUMENT_EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    throw new Error(`Unsupported file type "${file.type || "unknown"}". Use PDF.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const assetId = randomUUID();
  await store.save(organizationId, assetId, `asset.${extension}`, buffer);
  return { url: assetUrl(organizationId, assetId, extension) };
}

export async function readOrgAsset(organizationId: string, assetId: string, extension: string): Promise<Buffer> {
  return store.read(`${organizationId}/${assetId}-asset.${extension}`);
}

/**
 * Best-effort cleanup for a previous org-asset URL being replaced — parses
 * the same URL shape assetUrl() produces; silently no-ops for any URL that
 * doesn't match (e.g. a legacy external URL from before this system existed,
 * which was never ours to delete).
 */
export async function removeOrgAssetByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const match = url.match(/\/api\/organizations\/([^/]+)\/assets\/([^/.]+)\.([a-z0-9]+)$/i);
  if (!match) return;
  const [, organizationId, assetId, extension] = match;
  await store.remove(`${organizationId}/${assetId}-asset.${extension}`).catch(() => {});
}
