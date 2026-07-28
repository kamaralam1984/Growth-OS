"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ["application/pdf"];

export interface DocumentUploadFieldProps {
  id: string;
  uploadUrl: string;
  extraFields?: Record<string, string>;
  value: string;
  onChange: (url: string) => void;
}

function fileNameFromUrl(url: string): string {
  const match = url.match(/\/([^/]+)\.[a-z0-9]+$/i);
  return match ? "Uploaded document" : url;
}

/**
 * Real PDF upload replacing a "paste a file URL" text field — same
 * organization-asset endpoint as ImageUploadField, "document" kind (no
 * image compression, raw bytes saved as-is).
 */
export function DocumentUploadField({ id, uploadUrl, extraFields, value, onChange }: DocumentUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      setError("Use a PDF file.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`Must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB or smaller.`);
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
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
      <div className="flex items-center gap-2">
        <input ref={fileInputRef} id={id} type="file" accept="application/pdf" onChange={handleSelect} className="hidden" />
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 flex-1 items-center gap-2 truncate rounded-lg border border-input px-3.5 text-sm text-foreground hover:bg-accent"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{fileNameFromUrl(value)}</span>
          </a>
        ) : (
          <span className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-dashed border-input px-3.5 text-sm text-muted-foreground">
            <FileText className="size-4 shrink-0" /> No file uploaded
          </span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="size-3.5" /> {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Remove file"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
