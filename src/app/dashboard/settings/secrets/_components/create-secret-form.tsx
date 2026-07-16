"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { createOrRotateSecret } from "../actions";

const CATEGORY_OPTIONS = [
  { value: "API_KEY", label: "API key" },
  { value: "OAUTH_SECRET", label: "OAuth secret" },
  { value: "JWT_SECRET", label: "JWT secret" },
  { value: "SMTP_CREDENTIAL", label: "SMTP credential" },
  { value: "DATABASE_CREDENTIAL", label: "Database credential" },
  { value: "ENCRYPTION_KEY", label: "Encryption key" },
  { value: "OTHER", label: "Other" },
] as const;

export interface RotateTarget {
  key: string;
  category: (typeof CATEGORY_OPTIONS)[number]["value"];
  description: string;
}

export interface CreateSecretFormProps {
  rotateTarget?: RotateTarget | null;
  onSaved?: () => void;
  onCancelRotate?: () => void;
}

/**
 * The caller (secrets-manager.tsx) must render this with a `key` derived
 * from rotateTarget (e.g. `rotateTarget?.key ?? "create"`) so switching
 * into/out of "rotate" mode remounts the form with fresh initial state,
 * rather than this component syncing props into state via an effect.
 */
export function CreateSecretForm({ rotateTarget, onSaved, onCancelRotate }: CreateSecretFormProps) {
  const [key, setKey] = useState(rotateTarget?.key ?? "");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["value"]>(rotateTarget?.category ?? "API_KEY");
  const [description, setDescription] = useState(rotateTarget?.description ?? "");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRotating = Boolean(rotateTarget);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOrRotateSecret({ key, value, category, description: description || undefined });
      if (!result.ok) {
        setError(result.error ?? "Could not save this secret.");
        toast.error(result.error ?? "Could not save this secret.");
        return;
      }
      toast.success(isRotating ? "Secret rotated." : "Secret saved.");
      setKey("");
      setCategory("API_KEY");
      setDescription("");
      setValue("");
      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isRotating && (
        <p className="text-sm text-muted-foreground">
          Rotating <span className="font-medium text-foreground">{rotateTarget!.key}</span> — enter the new value
          below. The old value will be gone the moment you submit.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Key" htmlFor="secretKey" required>
          <Input
            id="secretKey"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. STRIPE_API_KEY"
            maxLength={100}
            disabled={isRotating}
            required
          />
        </FormField>
        <FormField label="Category" htmlFor="secretCategory" required>
          <Select
            id="secretCategory"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number]["value"])}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Description" htmlFor="secretDescription">
        <Input
          id="secretDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this secret is used for"
          maxLength={500}
        />
      </FormField>

      <FormField label="Value" htmlFor="secretValue" required hint="Never logged or displayed again after this is saved.">
        <Input
          id="secretValue"
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isRotating ? "New value" : "Secret value"}
          required
        />
      </FormField>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !key.trim() || !value.trim()}>
          {pending ? "Saving..." : isRotating ? "Rotate secret" : "Add secret"}
        </Button>
        {isRotating && (
          <Button type="button" variant="outline" onClick={onCancelRotate}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
