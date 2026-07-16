import { XCircle, CheckCircle2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { getSignatureByToken } from "@/app/dashboard/proposal/_lib/signature-actions";
import { SigningForm } from "./_components/signing-form";

/** Public, unauthenticated signing page — the "Digital Signature Ready" MANUAL path's real client-facing surface. Access control is the unguessable token itself, same as the tracking-pixel/download routes. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getSignatureByToken(token);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <Container className="flex max-w-lg justify-center">
        {!result.ok || !result.signature ? (
          <Card glass className="w-full">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <XCircle className="size-10 text-destructive" />
              <p className="text-lg font-semibold text-foreground">Signature request not found</p>
              <p className="text-sm text-muted-foreground">{result.error ?? "This link is invalid or has expired."}</p>
            </CardContent>
          </Card>
        ) : result.signature.status === "SIGNED" ? (
          <Card glass className="w-full">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <CheckCircle2 className="size-10 text-primary" />
              <p className="text-lg font-semibold text-foreground">Already signed</p>
              <p className="text-sm text-muted-foreground">
                &ldquo;{result.signature.documentTitle}&rdquo; was signed by {result.signature.signerName}
                {result.signature.signedAt ? ` on ${result.signature.signedAt.toLocaleDateString()}` : ""}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <SigningForm token={token} documentTitle={result.signature.documentTitle} initialSignerName={result.signature.signerName} />
        )}
      </Container>
    </main>
  );
}
