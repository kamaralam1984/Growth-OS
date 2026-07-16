"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileIcon, Trash2, Download } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteDocument } from "../actions";

export interface DocDisplay {
  id: string;
  name: string;
  folder: string | null;
  sizeBytes: number;
  companyName: string | null;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents }: { documents: DocDisplay[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (documents.length === 0) {
    return (
      <Card glass>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <FileIcon className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">No documents yet. Upload your first file.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((doc) => (
        <Card key={doc.id} glass>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.folder ? `${doc.folder} · ` : ""}
                  {formatBytes(doc.sizeBytes)}
                  {doc.companyName ? ` · ${doc.companyName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`/api/documents/${doc.id}`}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Download"
              >
                <Download className="size-4" />
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await deleteDocument(doc.id);
                    router.refresh();
                  })
                }
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
