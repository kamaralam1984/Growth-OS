"use client";

import { useMemo } from "react";

import { renderMarkdown } from "@/lib/markdown";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  id?: string;
  /** Read-only viewers (no edit permission) get the rendered preview only, full-width — no editable textarea. */
  readOnly?: boolean;
}

/**
 * Real, working split-pane Markdown editor: a plain <textarea> plus a live
 * HTML preview rendered by src/lib/markdown.ts. This app has no
 * rich-text/markdown dependency installed and its stated style favors a
 * lean hand-rolled implementation over pulling in a WYSIWYG library for a
 * narrow need — see that file's header comment for the full reasoning.
 */
export function MarkdownEditor({ value, onChange, rows = 20, id, readOnly = false }: MarkdownEditorProps) {
  const html = useMemo(() => renderMarkdown(value), [value]);

  if (readOnly) {
    return (
      <div
        className="prose-kb overflow-y-auto rounded-2xl border border-border bg-muted/20 p-5 text-sm leading-relaxed text-foreground"
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Markdown</p>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full resize-y rounded-2xl border border-border bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Write in Markdown — headings, **bold**, _italic_, lists, `code`, [links](https://…), tables…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div
          className="prose-kb h-full min-h-[16rem] overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground"
          style={{ maxHeight: `${Math.max(rows, 10) * 1.75}rem` }}
          dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
        />
      </div>
    </div>
  );
}
