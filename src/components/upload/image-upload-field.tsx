"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImageIfNeeded, MAX_IMAGE_UPLOAD_BYTES, ALLOWED_IMAGE_UPLOAD_TYPES } from "@/lib/client/compress-image";

export interface ImageUploadFieldProps {
  id: string;
  /** Endpoint to POST the file to — must accept multipart FormData with a "file" field and respond 2xx with `{ url: string }`. */
  uploadUrl: string;
  /** Extra fields appended to the upload FormData (e.g. `{ kind: "image", previousUrl: value }` for the org-assets endpoint). */
  extraFields?: Record<string, string>;
  /** Current value — an internal serving URL from a prior upload, a legacy external URL, or empty. */
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
  "aria-describedby"?: string;
}

/**
 * Real file upload replacing a "paste an image URL" text field — picks a
 * file, compresses it client-side (src/lib/client/compress-image.ts),
 * uploads immediately to the generic organization-asset endpoint
 * (src/app/api/organizations/[organizationId]/assets/route.ts), and calls
 * onChange with the resulting URL exactly as if the user had pasted it —
 * so the surrounding form's existing save action needs no changes at all.
 * An external URL already in `value` (from before this field existed)
 * still displays and still submits correctly; only picking a new file
 * replaces it.
 */
export function ImageUploadField({ id, uploadUrl, extraFields, value, onChange, previewClassName, ...rest }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED_IMAGE_UPLOAD_TYPES.includes(file.type)) {
      setError("Use PNG, JPEG, WebP, GIF, or AVIF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(`Must be ${Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`);
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImageIfNeeded(file).catch(() => file);
      const body = new FormData();
      body.append("file", compressed);
      for (const [key, val] of Object.entries(extraFields ?? {})) body.append(key, val);

      const response = await fetch(uploadUrl, { method: "POST", body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Upload failed.");
        return;
      }
      const data: { url: string } = await response.json();
      onChange(data.url);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          id={id}
          type="file"
          accept={ALLOWED_IMAGE_UPLOAD_TYPES.join(",")}
          onChange={handleSelect}
          className="hidden"
          {...rest}
        />
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- may be an internal serving route or an external legacy URL, not a static/optimizable local asset
          <img src={value} alt="" className={cn("h-11 w-16 shrink-0 rounded-lg border border-border object-cover", previewClassName)} />
        ) : (
          <span className={cn("flex h-11 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-input text-muted-foreground", previewClassName)}>
            <ImagePlus className="size-4" />
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : value ? "Change" : "Upload"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Remove image"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
