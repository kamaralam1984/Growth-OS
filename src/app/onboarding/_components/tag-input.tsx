"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TagInputProps {
  presetOptions: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * Combines a preset toggle-chip grid (common countries) with a free-text
 * "add your own" field, so anything not on the curated list can still be
 * added as a removable tag. Case-insensitive de-duplication.
 */
export function TagInput({ presetOptions, value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

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

  function togglePreset(option: string) {
    if (value.includes(option)) removeTag(option);
    else addTag(option);
  }

  const customTags = value.filter((tag) => !presetOptions.includes(tag));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {presetOptions.map((option) => {
          const active = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => togglePreset(option)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-card"
                  : "border-border bg-transparent text-foreground hover:bg-accent",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {customTags.map((tag) => (
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder={placeholder ?? "Add another country and press Enter"}
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
