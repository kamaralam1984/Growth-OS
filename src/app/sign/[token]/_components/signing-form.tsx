"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { submitManualSignature } from "@/app/dashboard/proposal/_lib/signature-actions";

export function SigningForm({ token, documentTitle, initialSignerName }: { token: string; documentTitle: string; initialSignerName: string }) {
  const [signerName, setSignerName] = useState(initialSignerName);
  const [typedSignature, setTypedSignature] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitManualSignature(token, { signerName, typedSignature });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <Card glass className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-lg font-semibold text-foreground">Signed successfully</p>
          <p className="text-sm text-muted-foreground">Thank you, {signerName}. Your signature on &ldquo;{documentTitle}&rdquo; has been recorded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="size-5" /> Sign document
        </CardTitle>
        <CardDescription>You are signing &ldquo;{documentTitle}&rdquo;. By typing your name below and submitting, you agree this constitutes your legal signature.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Full name" htmlFor="signer-name" required>
            <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
          </FormField>
          <FormField label="Type your signature" htmlFor="signer-signature" required hint="Type your name as your signature.">
            <Input
              id="signer-signature"
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              required
              placeholder="e.g. Jamie Rivera"
              style={{ fontStyle: "italic", fontSize: "1.25rem" }}
            />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || !signerName.trim() || !typedSignature.trim()}>
            {pending ? "Submitting…" : "Sign & Submit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
