"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { deleteDocumentAction, reprocessDocumentAction } from "../actions";
import type { IngestedDocumentStatus } from "@/generated/prisma/client";

export function DocumentDetailActions({ documentId, status }: { documentId: string; status: IngestedDocumentStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleReprocess() {
    startTransition(async () => {
      const result = await reprocessDocumentAction(documentId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not reprocess this document.");
        return;
      }
      toast.success("Reprocessing started.");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Delete this document? Its chunks and embeddings will be removed permanently.")) return;
    startTransition(async () => {
      const result = await deleteDocumentAction(documentId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete this document.");
        return;
      }
      toast.success("Document deleted.");
      router.push("/dashboard/knowledge-base/documents");
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      {status === "FAILED" && (
        <Button type="button" variant="outline" size="sm" onClick={handleReprocess} disabled={pending}>
          {pending ? "Working…" : "Reprocess"}
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={handleDelete} disabled={pending} className="text-red-500 hover:bg-red-500/10">
        {pending ? "Working…" : "Delete"}
      </Button>
    </div>
  );
}
