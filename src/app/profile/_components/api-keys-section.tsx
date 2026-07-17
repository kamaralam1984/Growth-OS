"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { createApiKey, revokeApiKey } from "../actions";
import { API_KEY_SCOPES, API_KEY_SCOPE_DESCRIPTIONS, type ApiKeyScope } from "@/lib/auth/api-key-scopes";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeysSectionProps {
  initialKeys: ApiKeyRow[];
}

const DEFAULT_RATE_LIMIT = 1000;

export function ApiKeysSection({ initialKeys }: ApiKeysSectionProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [rateLimitPerHour, setRateLimitPerHour] = useState(String(DEFAULT_RATE_LIMIT));
  const [error, setError] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startRevokeTransition] = useTransition();

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const parsedLimit = Number(rateLimitPerHour);
      const result = await createApiKey(name, scopes, Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_RATE_LIMIT);
      if (!result.ok || !result.rawKey || !result.key) {
        setError(result.error ?? "Could not create the key.");
        toast.error(result.error ?? "Could not create the key.");
        return;
      }
      setNewRawKey(result.rawKey);
      setName("");
      setScopes([]);
      setRateLimitPerHour(String(DEFAULT_RATE_LIMIT));
      setKeys((prev) => [result.key!, ...prev]);
      toast.success("API key created.");
    });
  }

  function handleRevoke(id: string) {
    setError(null);
    setRevokingId(id);
    startRevokeTransition(async () => {
      const result = await revokeApiKey(id);
      setRevokingId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not revoke this key.");
        toast.error(result.error ?? "Could not revoke this key.");
        return;
      }
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
      );
      toast.success("API key revoked.");
    });
  }

  async function handleCopy() {
    if (!newRawKey) return;
    await navigator.clipboard.writeText(newRawKey);
    toast.success("Copied to clipboard.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle>Create new key</CardTitle>
          <CardDescription>
            API keys grant programmatic access to your organization&apos;s GrowthOS workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {newRawKey && (
            <Alert variant="warning">
              <KeyRound />
              <AlertTitle>Copy this now — you won&apos;t be able to see it again</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>Store this key somewhere safe. For security, we only show it once.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                    {newRawKey}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="size-4" />
                    Copy to clipboard
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <FormField label="Key name" htmlFor="apiKeyName" required className="flex-1">
                <Input
                  id="apiKeyName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CI pipeline"
                  maxLength={100}
                  required
                />
              </FormField>
              <FormField label="Rate limit (calls/hour)" htmlFor="apiKeyRateLimit" className="w-full sm:w-48">
                <Input
                  id="apiKeyRateLimit"
                  type="number"
                  min={1}
                  max={100_000}
                  value={rateLimitPerHour}
                  onChange={(e) => setRateLimitPerHour(e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Scopes" htmlFor="apiKeyScopes" hint="Leave all unchecked for a key that can authenticate but can't call anything yet.">
              <div id="apiKeyScopes" className="flex flex-col gap-2 rounded-lg border border-border p-3">
                {API_KEY_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      aria-label={scope}
                      className="mt-0.5"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>
                      <code className="text-xs">{scope}</code>
                      <span className="block text-xs text-muted-foreground">{API_KEY_SCOPE_DESCRIPTIONS[scope]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FormField>

            <div>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating..." : "Create key"}
              </Button>
            </div>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Your API keys</CardTitle>
          <CardDescription>Keys you&apos;ve generated for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium text-foreground">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{key.prefix}...</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.scopes.length === 0 ? (
                        <span className="text-xs">None</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {key.scopes.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-[10px]">
                              {scope}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      {key.revokedAt ? (
                        <Badge variant="outline">Revoked</Badge>
                      ) : (
                        <Badge variant="accent">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                        disabled={Boolean(key.revokedAt) || revokingId === key.id}
                      >
                        {revokingId === key.id ? "Revoking..." : "Revoke"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
