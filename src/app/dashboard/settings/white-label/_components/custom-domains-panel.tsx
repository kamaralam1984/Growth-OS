"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { addCustomDomainAction, removeCustomDomainAction, verifyCustomDomainAction } from "../actions";
import { DomainStatusBadge } from "./domain-status-badge";
import type { CustomDomain } from "@/generated/prisma/client";

export interface CustomDomainsPanelProps {
  canManage: boolean;
  domains: CustomDomain[];
}

function verificationRecordName(domain: string): string {
  return `_kvlgrowthos-verify.${domain}`;
}

/** Real custom-domain list + add form + per-domain "Verify now", which calls verifyCustomDomain synchronously and shows the real DNS result — never a simulated success. */
export function CustomDomainsPanel({ canManage, domains }: CustomDomainsPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addCustomDomainAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not add this domain.");
        toast.error(result.error ?? "Could not add this domain.");
        return;
      }
      toast.success("Domain added — publish the TXT record below, then verify.");
      formRef.current?.reset();
      router.refresh();
    });
  }

  function handleVerify(domainId: string) {
    setVerifyingId(domainId);
    startTransition(async () => {
      const result = await verifyCustomDomainAction(domainId);
      setVerifyingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not check this domain.");
        return;
      }
      const verified = result.detail?.toLowerCase().includes("matching") ?? false;
      if (verified) {
        toast.success(result.detail ?? "Domain verified.");
      } else {
        toast.info(result.detail ?? "Not verified yet.");
      }
      router.refresh();
    });
  }

  function handleRemove(domainId: string) {
    startTransition(async () => {
      const result = await removeCustomDomainAction(domainId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove this domain.");
        return;
      }
      toast.success("Domain removed.");
      router.refresh();
    });
  }

  return (
    <Card glass className="w-full">
      <CardHeader>
        <CardTitle>Custom domains</CardTitle>
        <CardDescription>
          Real DNS ownership verification via a TXT record — the same convention Vercel and Netlify use for their own
          domain verification. TLS/SSL issuance for a verified domain is not yet wired in; it requires a real hosting
          platform or ACME integration this application code cannot perform on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManage && (
          <form ref={formRef} onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField label="Domain" htmlFor="wl-domain" className="flex-1" hint="e.g. app.yourcompany.com — no protocol.">
              <Input id="wl-domain" name="domain" placeholder="app.yourcompany.com" required />
            </FormField>
            <Button type="submit" disabled={pending}>
              <Globe className="size-4" />
              Add domain
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom domains added yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {domains.map((domain) => (
              <li key={domain.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{domain.domain}</span>
                    <DomainStatusBadge status={domain.status} />
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      {domain.status !== "VERIFIED" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending && verifyingId === domain.id}
                          onClick={() => handleVerify(domain.id)}
                        >
                          <ShieldCheck className="size-3.5" />
                          {pending && verifyingId === domain.id ? "Checking…" : "Verify now"}
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10" onClick={() => handleRemove(domain.id)} disabled={pending}>
                        <Trash2 className="size-3.5" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                {domain.status !== "VERIFIED" && (
                  <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <p className="mb-1 font-medium text-foreground">DNS setup</p>
                    <p>Add a TXT record:</p>
                    <code className="mt-1 block break-all rounded bg-background px-2 py-1">
                      {verificationRecordName(domain.domain)} = {domain.verificationToken}
                    </code>
                  </div>
                )}
                {domain.status === "VERIFIED" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Verified {domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleString() : ""}. SSL issuance is not yet
                    wired in for this deployment — see src/lib/white-label/ssl-provider.ts.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
