"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TagInput } from "@/app/onboarding/_components/tag-input";
import { updateArticle, deleteArticle } from "../actions";
import { ArticleMetaFields, type ArticleKind, type ArticleVisibility, type CategoryOption } from "./article-meta-fields";
import { TagEntitySelect } from "./tag-entity-select";
import { MarkdownEditor } from "./markdown-editor";
import { StatusWorkflow } from "./status-workflow";
import { VersionHistory, type VersionRow } from "./version-history";
import { AttachmentsPanel, type AttachmentRow } from "./attachments-panel";
import { CommentThread, type CommentRow } from "./comment-thread";

export interface ArticleEditorProps {
  articleId: string;
  initialTitle: string;
  initialContent: string;
  initialTags: string[];
  initialTagEntityNames: string[];
  initialKind: ArticleKind;
  initialVisibility: ArticleVisibility;
  initialCategoryId: string;
  status: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  categories: CategoryOption[];
  tagSuggestions: string[];
  canEdit: boolean;
  canPublishOrg: boolean;
  versions: VersionRow[];
  attachments: AttachmentRow[];
  comments: CommentRow[];
}

export function ArticleEditor({
  articleId,
  initialTitle,
  initialContent,
  initialTags,
  initialTagEntityNames,
  initialKind,
  initialVisibility,
  initialCategoryId,
  status,
  reviewedByName,
  reviewedAt,
  categories,
  tagSuggestions,
  canEdit,
  canPublishOrg,
  versions,
  attachments,
  comments,
}: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState(initialTags);
  const [tagEntityNames, setTagEntityNames] = useState(initialTagEntityNames);
  const [kind, setKind] = useState<ArticleKind>(initialKind);
  const [visibility, setVisibility] = useState<ArticleVisibility>(initialVisibility);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startSave(async () => {
      const result = await updateArticle(articleId, { title, content, tags, tagEntityNames, kind, visibility, categoryId: categoryId || null });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const result = await deleteArticle(articleId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/dashboard/knowledge-base");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-w-md text-lg font-medium"
          disabled={!canEdit}
        />
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>

      <StatusWorkflow
        articleId={articleId}
        status={status}
        canManage={canEdit}
        canPublish={canPublishOrg}
        reviewedByName={reviewedByName}
        reviewedAt={reviewedAt}
      />

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="attachments">Attachments ({attachments.length})</TabsTrigger>
          <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="flex flex-col gap-4">
          {canEdit ? (
            <>
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
              <TagEntitySelect suggestions={tagSuggestions} value={tagEntityNames} onChange={setTagEntityNames} />
              <TagInput presetOptions={[]} value={tags} onChange={setTags} placeholder="Add a label and press Enter" />
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{kind}</Badge>
              <Badge variant="outline">{visibility === "PRIVATE" ? "Private" : "Organization"}</Badge>
              {categories.find((c) => c.id === categoryId) && (
                <Badge variant="accent">{categories.find((c) => c.id === categoryId)?.name}</Badge>
              )}
              {tagEntityNames.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
              {tags.map((t) => (
                <Badge key={`label-${t}`} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          <MarkdownEditor value={content} onChange={setContent} rows={20} readOnly={!canEdit} />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-primary">Saved.</p>}

          {canEdit && (
            <div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="versions">
          <VersionHistory articleId={articleId} versions={versions} canRestore={canPublishOrg} />
        </TabsContent>

        <TabsContent value="attachments">
          <AttachmentsPanel articleId={articleId} attachments={attachments} canManage={canEdit} />
        </TabsContent>

        <TabsContent value="comments">
          <CommentThread articleId={articleId} comments={comments} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
