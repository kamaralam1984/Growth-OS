"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { uploadDocumentAction } from "../actions";

export interface UploadDocumentFormProps {
  supportedExtensions: string[];
}

/** Mirrors src/app/dashboard/documents/_components/upload-form.tsx's exact toggle-card + FormData pattern. */
export function UploadDocumentForm({ supportedExtensions }: UploadDocumentFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadDocumentAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("Document uploaded — ingestion has started.");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Upload document
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Upload document</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="File"
            htmlFor="rag-doc-file"
            required
            className="sm:col-span-2"
            hint={`Supported: ${supportedExtensions.join(", ")} — up to 25MB.`}
          >
            <Input id="rag-doc-file" name="file" type="file" required />
          </FormField>
          <FormField label="Title" htmlFor="rag-doc-title" className="sm:col-span-2" hint="Defaults to the filename if left blank.">
            <Input id="rag-doc-title" name="title" placeholder="e.g. Q3 onboarding guide" maxLength={200} />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
