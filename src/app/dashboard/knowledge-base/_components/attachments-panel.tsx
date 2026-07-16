"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { uploadKnowledgeAttachment, deleteKnowledgeAttachment } from "../_lib/attachment-actions";

export interface AttachmentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface AttachmentsPanelProps {
  articleId: string;
  attachments: AttachmentRow[];
  canManage: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({ articleId, attachments, canManage }: AttachmentsPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, startUpload] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startUpload(async () => {
      const result = await uploadKnowledgeAttachment(articleId, formData);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("File attached.");
      formRef.current?.reset();
      router.refresh();
    });
  }

  function handleDelete(attachmentId: string) {
    if (!confirm("Delete this attachment?")) return;
    setDeletingId(attachmentId);
    startDelete(async () => {
      const result = await deleteKnowledgeAttachment(articleId, attachmentId);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        setDeletingId(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <form ref={formRef} onSubmit={handleUpload} className="flex flex-wrap items-center gap-3">
          <Input name="file" type="file" required className="max-w-xs" />
          <Button type="submit" size="sm" disabled={uploading}>
            <Upload className="size-4" /> {uploading ? "Uploading…" : "Attach file"}
          </Button>
        </form>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-2.5 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{a.filename}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(a.sizeBytes)}
                      {a.uploadedByName ? ` · uploaded by ${a.uploadedByName}` : ""} ·{" "}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/knowledge-attachments/${a.id}`} download={a.filename}>
                      <Download className="size-4" /> Download
                    </a>
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting && deletingId === a.id}
                      aria-label={`Delete ${a.filename}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
