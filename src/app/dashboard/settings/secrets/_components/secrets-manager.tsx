"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateSecretForm, type RotateTarget } from "./create-secret-form";
import { SecretsList, type SecretRow } from "./secrets-list";

export interface SecretsManagerProps {
  initialSecrets: SecretRow[];
}

/**
 * Glues the create/rotate form to the metadata list — "Rotate" on a row
 * pre-fills the form above with that row's key/category/description (never
 * its value, since the value was never sent to this client in the first
 * place) so submitting calls the same createOrRotateSecret action.
 */
export function SecretsManager({ initialSecrets }: SecretsManagerProps) {
  const router = useRouter();
  const [rotateTarget, setRotateTarget] = useState<RotateTarget | null>(null);

  function handleSaved() {
    setRotateTarget(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle>{rotateTarget ? "Rotate secret" : "Add secret"}</CardTitle>
          <CardDescription>
            Rotating an existing key overwrites its value and stamps a new &quot;last rotated&quot; time — the old
            value is gone the moment you submit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSecretForm
            key={rotateTarget?.key ?? "create"}
            rotateTarget={rotateTarget}
            onSaved={handleSaved}
            onCancelRotate={() => setRotateTarget(null)}
          />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Your secrets</CardTitle>
          <CardDescription>Metadata only — values are never shown here.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecretsList initialSecrets={initialSecrets} onRotate={setRotateTarget} />
        </CardContent>
      </Card>
    </div>
  );
}
