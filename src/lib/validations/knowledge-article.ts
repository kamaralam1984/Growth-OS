import { z } from "zod";

export const KNOWLEDGE_ARTICLE_KINDS = [
  "ARTICLE",
  "FAQ",
  "POLICY",
  "PROCEDURE",
  "PLAYBOOK",
  "TEMPLATE",
  "MEETING_NOTES",
  "SOP",
  "TECHNICAL_DOC",
  "SALES_DOC",
  "HR_DOC",
  "FINANCE_DOC",
] as const;

export const KNOWLEDGE_ARTICLE_VISIBILITIES = ["PRIVATE", "ORG"] as const;

export const knowledgeArticleSchema = z.object({
  title: z.string().trim().min(1, "Give the article a title."),
  content: z.string().trim().min(1, "The article can't be empty."),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  tagEntityNames: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  kind: z.enum(KNOWLEDGE_ARTICLE_KINDS).default("ARTICLE"),
  visibility: z.enum(KNOWLEDGE_ARTICLE_VISIBILITIES).default("ORG"),
  categoryId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export type KnowledgeArticleInput = z.infer<typeof knowledgeArticleSchema>;
