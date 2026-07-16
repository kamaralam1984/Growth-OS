"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function VerifyClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const response = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus("error");
        setError(data?.error ?? "This link is invalid or has expired.");
        return;
      }
      setStatus("success");
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <Card glass className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card glass className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <XCircle className="size-8 text-destructive" />
          <p className="text-lg font-semibold text-foreground">Link didn&rsquo;t work</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/dashboard" className="mt-2 text-sm text-foreground underline underline-offset-4">
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass className="w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="size-8 text-primary" />
        <p className="text-lg font-semibold text-foreground">Email verified</p>
        <p className="text-sm text-muted-foreground">Your email address has been confirmed.</p>
        <Link href="/dashboard" className="mt-2 text-sm text-foreground underline underline-offset-4">
          Continue to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
