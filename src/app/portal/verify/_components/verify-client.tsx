"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { verifyMagicLink } from "../../_lib/actions";

export function VerifyClient({ token, redirectTo }: { token: string; redirectTo: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await verifyMagicLink(token, false);
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        setError(result.error ?? "This link is invalid or has expired.");
        return;
      }
      router.push(result.redirectTo ?? redirectTo);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token, redirectTo, router]);

  if (status === "error") {
    return (
      <Card glass className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <XCircle className="size-8 text-destructive" />
          <p className="text-lg font-semibold text-foreground">Link didn&rsquo;t work</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass className="w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </CardContent>
    </Card>
  );
}
