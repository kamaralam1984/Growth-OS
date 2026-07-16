"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createDocumentTemplate } from "../../_lib/template-actions";

const DOC_KINDS = ["PROPOSAL", "QUOTATION", "CONTRACT", "INVOICE", "BUSINESS_DOCUMENT"] as const;
const CATEGORIES = ["SOFTWARE_DEVELOPMENT", "ERP", "CRM", "SAAS", "MOBILE_APPS", "AI_SOLUTIONS", "AUTOMATION", "CLOUD", "DEVOPS", "CONSULTING", "DIGITAL_TRANSFORMATION"] as const;

export function TemplateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>("PROPOSAL");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDocumentTemplate({
        name,
        docKind,
        category: (category || undefined) as (typeof CATEGORIES)[number] | undefined,
        content,
        isDefault,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setContent("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Template
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New template</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Name" htmlFor="template-name" required>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="Applies to" htmlFor="template-kind" required>
              <Select id="template-kind" value={docKind} onChange={(e) => setDocKind(e.target.value as typeof docKind)}>
                {DOC_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Industry category" htmlFor="template-category">
              <Select id="template-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Any</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Content" htmlFor="template-content" required hint="Use {{placeholders}} for values filled in per-document.">
            <textarea
              id="template-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3.5 py-2.5 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Set as default template for this document type
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !name.trim() || !content.trim()}>
              {pending ? "Saving…" : "Save template"}
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
