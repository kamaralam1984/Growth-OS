"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { connectIntegrationWithCredentials } from "../actions";
import type { ApiKeyCredentialField, IntegrationProviderKey } from "@/lib/integrations/types";

export interface ConnectApiKeyDialogProps {
  provider: IntegrationProviderKey;
  providerName: string;
  fields: ApiKeyCredentialField[];
}

/** Credential-entry dialog for API_KEY-auth adapters (Stripe, Twilio, SendGrid, ...) — the non-redirect counterpart to the OAuth "Connect" link. */
export function ConnectApiKeyDialog({ provider, providerName, fields }: ConnectApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allFilled = fields.every((f) => values[f.key]?.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await connectIntegrationWithCredentials(provider, values);
      if (!result.ok) {
        setError(result.error ?? "Could not connect this integration.");
        toast.error(result.error ?? "Could not connect this integration.");
        return;
      }
      toast.success(`${providerName} connected.`);
      setOpen(false);
      setValues({});
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setValues({});
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Connect
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Connect {providerName}
          </DialogTitle>
          <DialogDescription>
            These credentials are encrypted at rest and never sent to the browser again after saving. We verify them
            with a real API call before marking this integration Connected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {fields.map((field) => (
            <FormField key={field.key} label={field.label} htmlFor={`cred-${field.key}`} required>
              <Input
                id={`cred-${field.key}`}
                type={field.secret === false ? "text" : "password"}
                autoComplete="off"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                required
              />
            </FormField>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending || !allFilled}>
              {pending ? "Verifying..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
