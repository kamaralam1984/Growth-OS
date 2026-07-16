"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Copy, KeyRound, Webhook as WebhookIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import type { Webhook } from "@/generated/prisma/client";
import {
  createWebhookAction,
  listWebhooksAction,
  rotateWebhookSecretAction,
  toggleWebhookActiveAction,
  deleteWebhookAction,
} from "../../../actions";

export interface WebhookManagerProps {
  workflowId: string;
}

interface RevealedSecret {
  title: string;
  secret: string;
  url?: string;
}

function receivableUrl(slug: string): string {
  if (typeof window === "undefined") return `/api/webhooks/custom/${slug}`;
  return `${window.location.origin}/api/webhooks/custom/${slug}`;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard.");
}

/**
 * Per-workflow webhook management — real create/list/rotate/toggle/delete
 * wired to the Server Actions in ../../../actions.ts. Fetches its own list
 * client-side (rather than receiving it as a server-rendered prop) so it can
 * show a real loading state independent of the rest of the workflow detail
 * page, and refetches after every mutation instead of mutating local state
 * optimistically. The reveal-once secret banner mirrors ApiKeysSection in
 * src/app/profile/_components/api-keys-section.tsx exactly — same Alert
 * variant, title, and copy affordance — since that's this codebase's
 * established pattern for showing a freshly-generated secret exactly once.
 */
export function WebhookManager({ workflowId }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  const [targetUrl, setTargetUrl] = useState("");
  const [outgoingError, setOutgoingError] = useState<string | null>(null);

  const [creatingIncoming, startCreateIncoming] = useTransition();
  const [creatingOutgoing, startCreateOutgoing] = useTransition();
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingPending, startRotate] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingPending, startToggle] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingPending, startDelete] = useTransition();

  const refetch = useCallback(() => {
    setLoadError(null);
    listWebhooksAction(workflowId).then((result) => {
      if (!result.ok || !result.webhooks) {
        setLoadError(result.error ?? "Could not load webhooks.");
        return;
      }
      setWebhooks(result.webhooks);
    });
  }, [workflowId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  function handleCreateIncoming() {
    startCreateIncoming(async () => {
      const result = await createWebhookAction({ direction: "INCOMING", workflowId });
      if (!result.ok || !result.webhook || !result.plaintextSecret) {
        toast.error(result.error ?? "Could not create the webhook.");
        return;
      }
      setRevealed({
        title: "Incoming webhook created",
        secret: result.plaintextSecret,
        url: result.webhook.slug ? receivableUrl(result.webhook.slug) : undefined,
      });
      toast.success("Incoming webhook created.");
      refetch();
    });
  }

  function handleCreateOutgoing(e: React.FormEvent) {
    e.preventDefault();
    setOutgoingError(null);
    startCreateOutgoing(async () => {
      const result = await createWebhookAction({ direction: "OUTGOING", workflowId, targetUrl });
      if (!result.ok || !result.webhook || !result.plaintextSecret) {
        setOutgoingError(result.error ?? "Could not create the webhook.");
        toast.error(result.error ?? "Could not create the webhook.");
        return;
      }
      setRevealed({ title: "Outgoing webhook created", secret: result.plaintextSecret });
      toast.success("Outgoing webhook created.");
      setTargetUrl("");
      refetch();
    });
  }

  function handleRotate(webhook: Webhook) {
    if (!confirm("Rotate this webhook's signing secret? The old secret stops working immediately.")) return;
    setRotatingId(webhook.id);
    startRotate(async () => {
      const result = await rotateWebhookSecretAction(webhook.id);
      setRotatingId(null);
      if (!result.ok || !result.plaintextSecret) {
        toast.error(result.error ?? "Could not rotate this secret.");
        return;
      }
      setRevealed({
        title: "Secret rotated",
        secret: result.plaintextSecret,
        url: webhook.direction === "INCOMING" && webhook.slug ? receivableUrl(webhook.slug) : undefined,
      });
      toast.success("Secret rotated.");
      refetch();
    });
  }

  function handleToggle(webhook: Webhook) {
    setTogglingId(webhook.id);
    startToggle(async () => {
      const result = await toggleWebhookActiveAction(webhook.id, !webhook.active);
      setTogglingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update this webhook.");
        return;
      }
      toast.success(webhook.active ? "Webhook deactivated." : "Webhook activated.");
      refetch();
    });
  }

  function handleDelete(webhook: Webhook) {
    if (!confirm(`Delete this ${webhook.direction.toLowerCase()} webhook? This can't be undone.`)) return;
    setDeletingId(webhook.id);
    startDelete(async () => {
      const result = await deleteWebhookAction(webhook.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete this webhook.");
        return;
      }
      toast.success("Webhook deleted.");
      refetch();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {revealed && (
        <Alert variant="warning">
          <KeyRound />
          <AlertTitle>Copy this now — you won&apos;t be able to see it again</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              {revealed.title}. Store the signing secret somewhere safe — for security, we only show it once.
            </p>
            {revealed.url && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide opacity-70">
                  Receive URL
                </span>
                <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {revealed.url}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(revealed.url!)}>
                  <Copy className="size-4" />
                  Copy
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide opacity-70">
                Signing secret
              </span>
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                {revealed.secret}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(revealed.secret)}>
                <Copy className="size-4" />
                Copy
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRevealed(null)}>
              I&apos;ve saved this
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card glass>
          <CardHeader>
            <CardTitle>Incoming webhook</CardTitle>
            <CardDescription>
              Generates a unique URL that external services can POST to in order to trigger this workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={handleCreateIncoming} disabled={creatingIncoming}>
              <WebhookIcon className="size-4" />
              {creatingIncoming ? "Creating..." : "Create incoming webhook"}
            </Button>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle>Outgoing webhook</CardTitle>
            <CardDescription>
              Signs and POSTs this workflow&apos;s payload to an external URL you control.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOutgoing} className="flex flex-col gap-4">
              <FormField label="Target URL" htmlFor="webhookTargetUrl" required>
                <Input
                  id="webhookTargetUrl"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/growthos"
                  required
                />
              </FormField>
              {outgoingError && <p className="text-sm text-destructive">{outgoingError}</p>}
              <Button type="submit" disabled={creatingOutgoing || !targetUrl.trim()}>
                {creatingOutgoing ? "Creating..." : "Create outgoing webhook"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>Incoming and outgoing webhooks configured for this workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError && <p className="mb-4 text-sm text-destructive">{loadError}</p>}
          {webhooks === null && !loadError ? (
            <p className="text-sm text-muted-foreground">Loading webhooks...</p>
          ) : webhooks && webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhooks yet.</p>
          ) : webhooks ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last triggered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => {
                  const endpoint = webhook.direction === "INCOMING" && webhook.slug ? receivableUrl(webhook.slug) : webhook.targetUrl ?? "—";
                  return (
                    <TableRow key={webhook.id}>
                      <TableCell>
                        <Badge variant="outline">{webhook.direction}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex items-center gap-2">
                          <code className="truncate text-xs text-muted-foreground">{endpoint}</code>
                          {endpoint !== "—" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="shrink-0 px-1.5"
                              onClick={() => copyToClipboard(endpoint)}
                              aria-label="Copy endpoint"
                            >
                              <Copy className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={webhook.active ? "accent" : "outline"}>{webhook.active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(webhook.lastTriggeredAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggle(webhook)}
                            disabled={togglingPending && togglingId === webhook.id}
                          >
                            {togglingPending && togglingId === webhook.id
                              ? "Updating..."
                              : webhook.active
                                ? "Deactivate"
                                : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRotate(webhook)}
                            disabled={rotatingPending && rotatingId === webhook.id}
                          >
                            {rotatingPending && rotatingId === webhook.id ? "Rotating..." : "Rotate secret"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(webhook)}
                            disabled={deletingPending && deletingId === webhook.id}
                            className="text-red-500 hover:bg-red-500/10"
                          >
                            {deletingPending && deletingId === webhook.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
