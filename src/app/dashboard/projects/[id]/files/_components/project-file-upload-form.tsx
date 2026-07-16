"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadProjectFile } from "../actions";

interface ProjectFileUploadFormProps {
  projectId: string;
  /** Present when this form uploads a new VERSION of an existing file rather than a brand new file. */
  projectFileId?: string;
  fileName?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "sm" | "md" | "lg";
}

export function ProjectFileUploadForm({
  projectId,
  projectFileId,
  fileName,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
}: ProjectFileUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isNewVersion = !!projectFileId;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadProjectFile(projectId, formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size={triggerSize} variant={triggerVariant}>
        <Upload className="size-4" /> {triggerLabel ?? (isNewVersion ? "Upload new version" : "Upload file")}
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{isNewVersion ? `New version of "${fileName}"` : "Upload file"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isNewVersion && <input type="hidden" name="projectFileId" value={projectFileId} />}

          <FormField label="File" htmlFor={`proj-file-${projectFileId ?? "new"}`} required className="sm:col-span-2">
            <Input id={`proj-file-${projectFileId ?? "new"}`} name="file" type="file" required />
          </FormField>

          {!isNewVersion && (
            <FormField label="Folder" htmlFor="proj-file-folder">
              <Input id="proj-file-folder" name="folder" placeholder="Deliverables" />
            </FormField>
          )}

          <FormField label="Change note" htmlFor="proj-file-change-note" className={isNewVersion ? "sm:col-span-2" : undefined}>
            <Input id="proj-file-change-note" name="changeNote" placeholder="What changed in this upload?" />
          </FormField>

          {!isNewVersion && (
            <label className="mt-6 flex items-center gap-1.5 text-sm text-foreground">
              <input id="proj-file-visible" name="visibleToClient" type="checkbox" />
              Visible to client in the Client Portal
            </label>
          )}

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
