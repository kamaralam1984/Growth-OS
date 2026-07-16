"use client";

import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { KNOWLEDGE_ARTICLE_KINDS, KNOWLEDGE_ARTICLE_VISIBILITIES } from "@/lib/validations/knowledge-article";

export type ArticleKind = (typeof KNOWLEDGE_ARTICLE_KINDS)[number];
export type ArticleVisibility = (typeof KNOWLEDGE_ARTICLE_VISIBILITIES)[number];

const KIND_LABELS: Record<ArticleKind, string> = {
  ARTICLE: "Article",
  FAQ: "FAQ",
  POLICY: "Policy",
  PROCEDURE: "Procedure",
  PLAYBOOK: "Playbook",
  TEMPLATE: "Template",
  MEETING_NOTES: "Meeting notes",
  SOP: "SOP",
  TECHNICAL_DOC: "Technical doc",
  SALES_DOC: "Sales doc",
  HR_DOC: "HR doc",
  FINANCE_DOC: "Finance doc",
};

export interface CategoryOption {
  id: string;
  name: string;
}

export interface ArticleMetaFieldsProps {
  kind: ArticleKind;
  onKindChange: (value: ArticleKind) => void;
  visibility: ArticleVisibility;
  onVisibilityChange: (value: ArticleVisibility) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  categories: CategoryOption[];
  /** Whether the current user is OWNER/ADMIN — only they may publish an article org-wide. */
  canPublishOrg: boolean;
}

export function ArticleMetaFields({
  kind,
  onKindChange,
  visibility,
  onVisibilityChange,
  categoryId,
  onCategoryChange,
  categories,
  canPublishOrg,
}: ArticleMetaFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FormField label="Kind" htmlFor="article-kind">
        <Select id="article-kind" value={kind} onChange={(e) => onKindChange(e.target.value as ArticleKind)}>
          {KNOWLEDGE_ARTICLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Visibility"
        htmlFor="article-visibility"
        hint={!canPublishOrg ? "Only owners/admins can publish organization-wide." : undefined}
      >
        <Select id="article-visibility" value={visibility} onChange={(e) => onVisibilityChange(e.target.value as ArticleVisibility)}>
          <option value="PRIVATE">Private (only you)</option>
          <option value="ORG" disabled={!canPublishOrg}>
            Organization
          </option>
        </Select>
      </FormField>

      <FormField label="Category" htmlFor="article-category">
        <Select id="article-category" value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>
    </div>
  );
}
