"use client";

import { useState } from "react";
import { Monitor, Smartphone, Moon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PreviewMode = "desktop" | "mobile" | "dark";

const MODES: Array<{ mode: PreviewMode; label: string; icon: typeof Monitor }> = [
  { mode: "desktop", label: "Desktop", icon: Monitor },
  { mode: "mobile", label: "Mobile", icon: Smartphone },
  { mode: "dark", label: "Dark mode", icon: Moon },
];

/** Three real CSS-frame renderings of the same real draft content — a genuine layout preview, not a mock screenshot. */
export function EmailPreviewToggle({ subject, body }: { subject: string | null; body: string }) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const isDark = mode === "dark";
  const isMobile = mode === "mobile";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {MODES.map(({ mode: m, label, icon: Icon }) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            <Icon className="size-3.5" /> {label}
          </Button>
        ))}
      </div>
      <div className={cn("flex justify-center rounded-xl border border-border bg-muted/30 p-4", isDark && "bg-neutral-950")}>
        <div
          className={cn(
            "overflow-hidden rounded-lg border shadow-card transition-all",
            isDark ? "border-neutral-800 bg-neutral-900 text-neutral-100" : "border-border bg-white text-neutral-900",
            isMobile ? "w-[320px]" : "w-full max-w-[560px]",
          )}
        >
          {subject && (
            <div className={cn("border-b px-4 py-3 text-sm font-medium", isDark ? "border-neutral-800" : "border-neutral-200")}>{subject}</div>
          )}
          <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed">{body}</div>
        </div>
      </div>
    </div>
  );
}
