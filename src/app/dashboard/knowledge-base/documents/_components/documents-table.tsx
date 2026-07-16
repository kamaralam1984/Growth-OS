"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatRelativeTime } from "@/lib/utils";
import { deleteDocumentAction, reprocessDocumentAction } from "../actions";
import { DocumentStatusBadge } from "./document-status-badge";
import type { IngestedDocumentSourceKind, IngestedDocumentStatus } from "@/generated/prisma/client";

export interface DocumentRow {
  id: string;
  title: string;
  sourceKind: IngestedDocumentSourceKind;
  originalFilename: string | null;
  status: IngestedDocumentStatus;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
}

export interface DocumentsTableProps {
  documents: DocumentRow[];
  canManage: boolean;
}

export function DocumentsTable({ documents, canManage }: DocumentsTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(row: DocumentRow) {
    if (!confirm(`Delete "${row.title}"? Its chunks and embeddings will be removed permanently.`)) return;
    setBusyId(row.id);
    startTransition(async () => {
      const result = await deleteDocumentAction(row.id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete this document.");
        return;
      }
      toast.success("Document deleted.");
      router.refresh();
    });
  }

  function handleReprocess(row: DocumentRow) {
    setBusyId(row.id);
    startTransition(async () => {
      const result = await reprocessDocumentAction(row.id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not reprocess this document.");
        return;
      }
      toast.success("Reprocessing started.");
      router.refresh();
    });
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents ingested yet. Upload one to get started.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Uploaded</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/dashboard/knowledge-base/documents/${row.id}`} className="font-medium text-foreground hover:underline">
                {row.title}
              </Link>
              <p className="text-xs text-muted-foreground">{row.originalFilename ?? row.sourceKind}</p>
              {row.status === "FAILED" && row.error && (
                <p className="mt-1 max-w-md text-xs text-red-500">{row.error}</p>
              )}
            </TableCell>
            <TableCell>
              <DocumentStatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.chunkCount}</TableCell>
            <TableCell className="text-muted-foreground">{formatRelativeTime(row.createdAt)}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {row.status === "FAILED" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleReprocess(row)}
                      disabled={busyId === row.id}
                    >
                      {busyId === row.id ? "Working…" : "Reprocess"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(row)}
                    disabled={busyId === row.id}
                    className="text-red-500 hover:bg-red-500/10"
                  >
                    {busyId === row.id ? "Working…" : "Delete"}
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
