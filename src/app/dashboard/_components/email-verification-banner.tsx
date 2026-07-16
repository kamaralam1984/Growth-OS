"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resendVerificationEmail } from "@/lib/auth/verification-actions";

export function EmailVerificationBanner() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendVerificationEmail();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <MailWarning className="size-4 shrink-0" />
        <span>
          {sent
            ? "Verification email sent — check your inbox."
            : "Please verify your email address to secure your account."}
        </span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
      {!sent && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={handleResend}>
          {pending ? "Sending..." : "Resend email"}
        </Button>
      )}
    </div>
  );
}
