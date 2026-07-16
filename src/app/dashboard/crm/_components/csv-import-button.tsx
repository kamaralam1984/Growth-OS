"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImportResult } from "../_lib/import-export";

export interface CsvImportButtonProps {
  label: string;
  action: (formData: FormData) => Promise<ImportResult>;
}

/** Shared CSV/Excel bulk-import trigger — used for both Contacts and Companies. Google Contacts OAuth import is out of scope (see completion report). */
export function CsvImportButton({ label, action }: CsvImportButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setResult(null);
    startTransition(async () => {
      const res = await action(formData);
      setResult(res);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileChange} />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
        <FileUp className="size-4" />
        {pending ? "Importing…" : label}
      </Button>
      {result && (
        <p className={`max-w-xs text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {result.ok
            ? `Imported ${result.imported ?? 0}, skipped ${result.skipped ?? 0}.`
            : (result.error ?? "Import failed.")}
        </p>
      )}
    </div>
  );
}
