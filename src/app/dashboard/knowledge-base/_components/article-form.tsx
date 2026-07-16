"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from "@/app/onboarding/_components/tag-input";
import { createArticle } from "../actions";
import { ArticleMetaFields, type ArticleKind, type ArticleVisibility, type CategoryOption } from "./article-meta-fields";
import { TagEntitySelect } from "./tag-entity-select";
import { MarkdownEditor } from "./markdown-editor";

export interface ArticleFormProps {
  categories: CategoryOption[];
  tagSuggestions: string[];
  canPublishOrg: boolean;
}

export function ArticleForm({ categories, tagSuggestions, canPublishOrg }: ArticleFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagEntityNames, setTagEntityNames] = useState<string[]>([]);
  const [kind, setKind] = useState<ArticleKind>("ARTICLE");
  const [visibility, setVisibility] = useState<ArticleVisibility>(canPublishOrg ? "ORG" : "PRIVATE");
  const [categoryId, setCategoryId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createArticle({ title, content, tags, tagEntityNames, kind, visibility, categoryId: categoryId || null });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.articleId) router.push(`/dashboard/knowledge-base/${result.articleId}`);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New article
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New article</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="article-title" required>
            <Input id="article-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>

          <ArticleMetaFields
            kind={kind}
            onKindChange={setKind}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            categories={categories}
            canPublishOrg={canPublishOrg}
          />

          <FormField label="Tags" htmlFor="article-tags">
            <TagEntitySelect suggestions={tagSuggestions} value={tagEntityNames} onChange={setTagEntityNames} />
          </FormField>

          <FormField label="Free-text labels" htmlFor="article-free-tags" hint="Simple labels, separate from the tags above.">
            <TagInput presetOptions={[]} value={tags} onChange={setTags} placeholder="Add a label and press Enter" />
          </FormField>

          <FormField label="Content" htmlFor="article-content" required>
            <MarkdownEditor id="article-content" value={content} onChange={setContent} rows={10} />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !title.trim() || !content.trim()}>
              {pending ? "Saving…" : "Save article"}
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
