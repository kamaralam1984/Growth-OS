import { AlertTriangle } from "lucide-react";

/**
 * Shown at the top of the draft legal pages (privacy/terms/cookies) —
 * standard SaaS boilerplate, not yet reviewed by a lawyer. Visible and
 * persistent so the page is never mistaken for final, authoritative policy.
 */
export function DraftLegalBanner() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Draft — pending legal review.</strong> This page is standard boilerplate
        and is not yet final or legally reviewed. Do not rely on it as a binding legal document.
      </p>
    </div>
  );
}
