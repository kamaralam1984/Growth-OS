"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Dismissible (for this render only — reappears on next navigation, same as the honesty-first pattern elsewhere: it's real, current state, not something to permanently silence). */
export function EmbeddingsBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Alert variant="warning">
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>No embedding provider connected</span>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </AlertTitle>
      <AlertDescription>
        Uploaded documents will sit in PENDING/FAILED until an embedding provider is connected.{" "}
        <Link href="/dashboard/settings/integrations" className="font-medium underline underline-offset-2">
          Connect one in the Integration Hub
        </Link>
        , then use Reprocess on any failed document.
      </AlertDescription>
    </Alert>
  );
}
