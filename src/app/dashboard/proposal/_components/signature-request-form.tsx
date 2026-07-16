"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface SignatureRequestFormProps {
  documentId: string;
  action: (documentId: string, signerName: string, signerEmail: string) => Promise<{ ok: boolean; error?: string; signingUrl?: string }>;
}

/** Reused by Contracts and Legal & Project Docs — creates a real Signature record and emails the real /sign/[token] link (the "Digital Signature Ready" MANUAL path). */
export function SignatureRequestForm({ documentId, action }: SignatureRequestFormProps) {
  const router = useRouter();
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const result = await action(documentId, signerName, signerEmail);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSigningUrl(result.signingUrl ?? null);
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="size-4" /> Request signature
        </CardTitle>
        <CardDescription>Sends a real signing link — the recipient types their name and signature on a public page.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        <Input type="email" placeholder="signer@company.com" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {signingUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
            <span className="truncate text-muted-foreground">{signingUrl}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(signingUrl)} aria-label="Copy link" className="shrink-0 text-primary hover:underline">
              <Copy className="size-3.5" />
            </button>
          </div>
        )}
        <Button type="button" size="sm" onClick={handleRequest} disabled={pending || !signerName.trim() || !signerEmail.trim()}>
          {pending ? "Sending…" : "Request signature"}
        </Button>
      </CardContent>
    </Card>
  );
}
