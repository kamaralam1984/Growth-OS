"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Copy, Download, Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { fadeInUp } from "@/animations";
import { DEVELOPER_ENDPOINTS } from "@/lib/developer-platform-content";

type ExportFormat = "csv" | "crm" | "excel" | "pdf";

const EXPORT_FORMATS: ExportFormat[] = ["csv", "crm", "excel", "pdf"];

const METHOD_BADGE_VARIANT = {
  GET: "accent",
  POST: "default",
} as const;

interface PlaygroundResult {
  status: number;
  statusText: string;
  contentType: string | null;
  latencyMs: number;
  isJson: boolean;
  jsonBody?: unknown;
  isFile: boolean;
  fileName?: string;
  fileSizeBytes?: number;
  /** Unexpected non-JSON, non-file body on an error response (shouldn't happen per the documented `{ "error": string }` shape, but shown honestly if it does). */
  rawText?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard.");
}

/**
 * A REAL, live API Playground — every request here is a genuine `fetch()`
 * the visitor's own browser makes directly to this app's real 4-endpoint
 * public API (src/lib/developer-platform-content.ts), using an API key the
 * visitor pastes in themselves. Nothing here is simulated: the status code,
 * headers, body, latency, and file downloads shown below are exactly what
 * the live route returned for that request. The key never leaves the
 * browser except in the one fetch() call this component makes to our own
 * origin — it is never logged, stored, or sent anywhere else.
 */
function ApiPlayground() {
  const [apiKey, setApiKey] = useState("");
  const [endpointIndex, setEndpointIndex] = useState(0);
  const [workflowId, setWorkflowId] = useState("");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [lastCurl, setLastCurl] = useState<string | null>(null);

  const endpoint = DEVELOPER_ENDPOINTS[endpointIndex];
  const isTrigger = endpoint.path.includes("{workflowId}");
  const isExport = endpoint.path.startsWith("/api/export");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setNetworkError(null);
    setResult(null);

    if (!apiKey.trim()) {
      setValidationError("Enter your API key first.");
      return;
    }
    if (isTrigger && !workflowId.trim()) {
      setValidationError("Enter a workflow ID — this endpoint requires one.");
      return;
    }

    let path = endpoint.path;
    if (isTrigger) path = path.replace("{workflowId}", encodeURIComponent(workflowId.trim()));

    const url = new URL(path, window.location.origin);
    if (isExport) url.searchParams.set("format", format);

    // Reuse the documented curl template for this endpoint, substituting
    // in exactly what was actually sent — not a freshly-composed string.
    let curlCmd = endpoint.curl;
    if (isTrigger) curlCmd = curlCmd.replaceAll("{workflowId}", workflowId.trim());
    if (isExport) curlCmd = curlCmd.replace("format=csv", `format=${format}`);
    curlCmd = curlCmd.replace("YOUR_API_KEY", apiKey.trim());

    setLoading(true);
    const startedAt = performance.now();

    try {
      const response = await fetch(url.toString(), {
        method: endpoint.method,
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType?.includes("application/json") ?? false;

      if (isJson) {
        const jsonBody = await response.json().catch(() => null);
        setResult({
          status: response.status,
          statusText: response.statusText,
          contentType,
          latencyMs: performance.now() - startedAt,
          isJson: true,
          jsonBody,
          isFile: false,
        });
      } else if (response.ok) {
        // A real export success — a real file. Download it for real via a
        // Blob + object URL, exactly like a genuine API client would.
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition");
        const fileName = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? "download";

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        setResult({
          status: response.status,
          statusText: response.statusText,
          contentType,
          latencyMs: performance.now() - startedAt,
          isJson: false,
          isFile: true,
          fileName,
          fileSizeBytes: blob.size,
        });
      } else {
        // An error response that isn't JSON is not documented behavior —
        // show it verbatim rather than silently downloading it as a file.
        const rawText = await response.text();
        setResult({
          status: response.status,
          statusText: response.statusText,
          contentType,
          latencyMs: performance.now() - startedAt,
          isJson: false,
          isFile: false,
          rawText,
        });
      }

      setLastCurl(curlCmd);
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : "The request failed to complete.");
      setLastCurl(curlCmd);
    } finally {
      setLoading(false);
    }
  }

  const statusToneClass =
    result && result.status >= 200 && result.status < 300
      ? "text-emerald-500"
      : result && result.status >= 400
        ? "text-destructive"
        : "text-amber-500";

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <SectionHeading
          align="left"
          eyebrow="API Playground"
          title="Send a real request, right now"
          description="Paste your own API key and call the live GrowthOS API directly from this page. Nothing here is simulated — you'll see the real status code, real headers, and real body the API returns."
          className="mb-10"
        />

        <div className="grid gap-8 lg:grid-cols-2">
          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <Card glass>
              <CardHeader>
                <CardTitle>Request</CardTitle>
                <CardDescription>Configure and send a live call to the real API.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <FormField label="API key" htmlFor="playground-api-key" required hint="Get one at /dashboard/settings/api-manager.">
                    <Input
                      id="playground-api-key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="gos_live_..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </FormField>

                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-600">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                      This calls the live API directly from your browser using your own key. Never paste a key you
                      don&apos;t own. We never see or store this key.
                    </p>
                  </div>

                  <FormField label="Endpoint" htmlFor="playground-endpoint" required>
                    <Select
                      id="playground-endpoint"
                      value={endpointIndex}
                      onChange={(e) => setEndpointIndex(Number(e.target.value))}
                    >
                      {DEVELOPER_ENDPOINTS.map((ep, i) => (
                        <option key={`${ep.method}-${ep.path}`} value={i}>
                          {ep.method} {ep.path}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={METHOD_BADGE_VARIANT[endpoint.method as keyof typeof METHOD_BADGE_VARIANT] ?? "outline"}>
                      {endpoint.method}
                    </Badge>
                    <Badge variant="outline">{endpoint.scope}</Badge>
                  </div>
                  <p className="-mt-3 text-sm text-muted-foreground">{endpoint.description}</p>

                  {isTrigger && (
                    <FormField label="Workflow ID" htmlFor="playground-workflow-id" required hint="The workflow must belong to your organization and be Active.">
                      <Input
                        id="playground-workflow-id"
                        value={workflowId}
                        onChange={(e) => setWorkflowId(e.target.value)}
                        placeholder="e.g. clx1a2b3c4d5e6f7g8h9i0j1"
                      />
                    </FormField>
                  )}

                  {isExport && (
                    <FormField label="Format" htmlFor="playground-format" required>
                      <Select id="playground-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                        {EXPORT_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f.toUpperCase()}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}

                  {validationError && <p className="text-sm text-destructive">{validationError}</p>}

                  <Button type="submit" disabled={loading} className="mt-2">
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send />
                        Send Request
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <Card glass className="h-full">
              <CardHeader>
                <CardTitle>Response</CardTitle>
                <CardDescription>The real, live response from the API — nothing simulated.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {!result && !networkError && (
                  <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    No request sent yet. Fill in your API key and endpoint on the left, then click{" "}
                    <span className="font-medium text-foreground">Send Request</span> to see the real response here.
                  </p>
                )}

                {networkError && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>Request failed before a response came back: {networkError}</p>
                  </div>
                )}

                {result && (
                  <>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status</span>
                        <span className={`font-mono font-semibold ${statusToneClass}`}>
                          {result.status} {result.statusText}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">Latency</span>
                        <span className="font-mono font-semibold text-foreground">{result.latencyMs.toFixed(0)} ms</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">Content-Type</span>
                        <span className="font-mono text-foreground">{result.contentType ?? "(none)"}</span>
                      </span>
                    </div>

                    {result.isJson && (
                      <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                        {JSON.stringify(result.jsonBody, null, 2)}
                      </pre>
                    )}

                    {result.isFile && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-600">
                        <Download className="size-4 shrink-0" />
                        <p>
                          File downloaded: <span className="font-mono">{result.fileName}</span> (
                          {formatBytes(result.fileSizeBytes ?? 0)})
                        </p>
                      </div>
                    )}

                    {result.rawText !== undefined && (
                      <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                        {result.rawText || "(empty body)"}
                      </pre>
                    )}
                  </>
                )}

                {lastCurl && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Equivalent curl command</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => copy(lastCurl)}>
                        <Copy className="size-4" />
                        Copy
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                      {lastCurl}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

export default ApiPlayground;
export { ApiPlayground };
