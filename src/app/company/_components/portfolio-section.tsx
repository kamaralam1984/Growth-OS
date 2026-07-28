"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Image as ImageIcon, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadField } from "@/components/upload/image-upload-field";
import type { PortfolioItemInput } from "@/lib/validations/company";
import { updatePortfolio } from "../actions";

export interface PortfolioSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: PortfolioItemInput[];
}

function newPortfolioItem(): PortfolioItemInput {
  return { id: crypto.randomUUID(), title: "", category: "", description: "", imageUrl: "", projectUrl: "" };
}

export function PortfolioSection({ orgId, canEdit, initial }: PortfolioSectionProps) {
  const [items, setItems] = useState<PortfolioItemInput[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(id: string, patch: Partial<PortfolioItemInput>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSuccess(false);
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updatePortfolio(orgId, items);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  if (!canEdit) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
          <CardDescription>Samples of your work.</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No portfolio items listed yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  <ImageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                        {item.category && (
                          <span className="ml-1 font-normal text-muted-foreground">({item.category})</span>
                        )}
                      </p>
                      {item.projectUrl && (
                        <a
                          href={item.projectUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
        <CardDescription>Samples of your work.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No portfolio items added yet.</p>}
          {items.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Title" htmlFor={`portfolio-title-${item.id}`} required>
                  <Input
                    id={`portfolio-title-${item.id}`}
                    value={item.title}
                    onChange={(e) => update(item.id, { title: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Category" htmlFor={`portfolio-category-${item.id}`}>
                  <Input
                    id={`portfolio-category-${item.id}`}
                    value={item.category ?? ""}
                    onChange={(e) => update(item.id, { category: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Image" htmlFor={`portfolio-image-${item.id}`}>
                  <ImageUploadField
                    id={`portfolio-image-${item.id}`}
                    uploadUrl={`/api/organizations/${orgId}/assets`}
                    extraFields={{ kind: "image", previousUrl: item.imageUrl ?? "" }}
                    value={item.imageUrl ?? ""}
                    onChange={(url) => update(item.id, { imageUrl: url })}
                  />
                </FormField>
                <FormField label="Project URL" htmlFor={`portfolio-project-${item.id}`}>
                  <Input
                    id={`portfolio-project-${item.id}`}
                    type="url"
                    placeholder="https://..."
                    value={item.projectUrl ?? ""}
                    onChange={(e) => update(item.id, { projectUrl: e.target.value })}
                  />
                </FormField>
              </div>
              <FormField label="Description" htmlFor={`portfolio-description-${item.id}`}>
                <textarea
                  id={`portfolio-description-${item.id}`}
                  rows={2}
                  value={item.description ?? ""}
                  onChange={(e) => update(item.id, { description: e.target.value })}
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove portfolio item ${index + 1}`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, newPortfolioItem()])}
            >
              <Plus className="size-4" /> Add portfolio item
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
