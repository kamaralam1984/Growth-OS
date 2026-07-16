"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SendDocumentFormProps {
  documentId: string;
  action: (documentId: string, recipientEmail: string, message?: string) => Promise<{ ok: boolean; error?: string }>;
}

/** Reused on every document type's detail page — real outbound send via sendOutreachEmail (Resend, falling back to SMTP), never a fire-and-forget fake send. */
export function SendDocumentForm({ documentId, action }: SendDocumentFormProps) {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await action(documentId, recipientEmail, message || undefined);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4" /> Send to client
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input type="email" placeholder="client@company.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Optional note to include…"
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="button" size="sm" onClick={handleSend} disabled={pending || !recipientEmail.trim()}>
          {pending ? "Sending…" : sent ? "Sent" : "Send"}
        </Button>
      </CardContent>
    </Card>
  );
}
