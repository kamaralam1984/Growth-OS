import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../../_lib/require-membership";
import { listSecretMetadata } from "@/lib/secrets/store";
import { SecretsManager } from "./_components/secrets-manager";

export default async function SecretsPage() {
  const { membership } = await requireActiveMembership("/dashboard/settings/secrets");

  const secrets = await listSecretMetadata(membership.organizationId);
  const rows = secrets.map((s) => ({
    id: s.id,
    key: s.key,
    category: s.category,
    description: s.description,
    lastRotatedAt: s.lastRotatedAt ? s.lastRotatedAt.toISOString() : null,
    lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Secrets Manager</h1>
        <p className="text-sm text-muted-foreground">
          Store API keys, SMTP credentials, JWT secrets, and other third-party credentials your Workflows&apos;
          CUSTOM_API/WEBHOOK nodes need. Values are AES-256-GCM encrypted at rest and write-only from this UI — once
          saved, a value is never displayed again, not even masked.
        </p>
      </div>

      <SecretsManager initialSecrets={rows} />
    </Container>
  );
}
