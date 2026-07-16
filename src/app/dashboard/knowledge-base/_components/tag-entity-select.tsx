"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TagEntitySelectProps {
  /** Existing organization KnowledgeTag names, used to power the autocomplete suggestions. */
  suggestions: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * Real-tag-entity autocomplete/multi-select for KnowledgeTag rows — distinct
 * from the pre-existing free-text `tags` chip list (TagInput). Suggestions
 * come from the organization's existing KnowledgeTag names via a native
 * <datalist> (no extra dependency needed for a real, working autocomplete);
 * typing a name that doesn't match an existing tag and pressing Enter still
 * adds it as a new chip — the server action upserts it into a real
 * KnowledgeTag row by slug on save.
 */
export function TagEntitySelect({ suggestions, value, onChange, placeholder }: TagEntitySelectProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          type="text"
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder={placeholder ?? "Add a tag and press Enter"}
          className={cn(
            "h-9 min-w-[200px] flex-1 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
