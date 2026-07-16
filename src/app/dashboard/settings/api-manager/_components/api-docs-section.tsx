"use client";

import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { API_DOCS } from "../_lib/api-docs-registry";
import { API_KEY_SCOPE_DESCRIPTIONS } from "@/lib/auth/api-key-scopes";

const METHOD_BADGE_VARIANT = {
  GET: "accent",
  POST: "default",
  PUT: "secondary",
  PATCH: "secondary",
  DELETE: "outline",
} as const;

function methodVariant(method: string) {
  return METHOD_BADGE_VARIANT[method as keyof typeof METHOD_BADGE_VARIANT] ?? "outline";
}

/**
 * `getAppBaseUrl`'s convention (src/lib/outreach/tracking.ts) is server-only
 * (reads process.env), so the curl example below just uses a relative path
 * against whatever host the key owner is actually calling — the accurate,
 * host-agnostic form for copy-pasteable docs.
 */
function curlExample(path: string): string {
  return `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  "https://<your-growthos-host>${path}"`;
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard.");
}

/**
 * Real, hand-maintained documentation for this app's actual API-key-gated
 * endpoints — sourced from API_DOCS (../_lib/api-docs-registry.ts), which is
 * only ever extended once a route is genuinely wired to verifyApiKeyAuth.
 * Renders nothing invented: if API_DOCS is short, that's because the app
 * genuinely only exposes that many endpoints today.
 */
export function ApiDocsSection() {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>API reference</CardTitle>
        <CardDescription>
          Endpoints your organization&apos;s API keys can call. Each requires the scope shown below,
          sent as <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {API_DOCS.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API-key-gated endpoints are wired up yet.</p>
        ) : (
          API_DOCS.map((doc) => (
            <div
              key={`${doc.method}-${doc.path}`}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={methodVariant(doc.method)}>{doc.method}</Badge>
                <code className="text-sm text-foreground">{doc.path}</code>
                <Badge variant="outline" title={API_KEY_SCOPE_DESCRIPTIONS[doc.scope]}>
                  {doc.scope}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">{doc.description}</p>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Example request</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copy(curlExample(doc.path))}
                  >
                    <Copy className="size-4" />
                    Copy curl
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                  {curlExample(doc.path)}
                </pre>
              </div>

              {doc.exampleResponse && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Example response</span>
                  <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                    {doc.exampleResponse}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
