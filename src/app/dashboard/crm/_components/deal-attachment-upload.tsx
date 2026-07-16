"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/app/dashboard/documents/actions";

/** Compact file uploader scoped to one Deal — reuses uploadDocument() from the Documents module (see linkedDealId support added there). */
export function DealAttachmentUpload({ dealId }: { dealId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("linkedDealId", dealId);
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        name="file"
        type="file"
        required
        className="max-w-[240px] text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Upload className="size-3.5" />
        {pending ? "Uploading…" : "Attach"}
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
