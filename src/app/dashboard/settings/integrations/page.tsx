import {
  Mail,
  Calendar,
  PenTool,
  Users,
  MessageSquare,
  HardDrive,
  CreditCard,
  Calculator,
  Video,
  Code2,
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveMembership } from "../../_lib/require-membership";
import { listAdapters } from "@/lib/integrations/registry";
import { listConnections } from "@/lib/integrations/connection-store";
import { disconnectIntegration, checkIntegrationHealth } from "./actions";
import { ConnectApiKeyDialog } from "./_components/connect-api-key-dialog";
import type { IntegrationCategory } from "@/lib/integrations/types";

const CATEGORY_ICON: Record<IntegrationCategory, typeof Mail> = {
  EMAIL: Mail,
  CALENDAR: Calendar,
  SIGNATURE: PenTool,
  CRM_SYNC: Users,
  COMMUNICATION: MessageSquare,
  STORAGE: HardDrive,
  PAYMENTS: CreditCard,
  ACCOUNTING: Calculator,
  MEETINGS: Video,
  DEVELOPMENT: Code2,
  AI_PROVIDER: Bot,
};

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  EMAIL: "Email",
  CALENDAR: "Calendar",
  SIGNATURE: "Signature",
  CRM_SYNC: "CRM sync",
  COMMUNICATION: "Communication",
  STORAGE: "Storage",
  PAYMENTS: "Payments",
  ACCOUNTING: "Accounting",
  MEETINGS: "Meetings",
  DEVELOPMENT: "Development",
  AI_PROVIDER: "AI provider",
};

function formatDateTime(date: Date | null): string {
  if (!date) return "never";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}) {
  const { membership } = await requireActiveMembership("/dashboard/settings/integrations");
  const params = await searchParams;

  const [adapters, connections] = await Promise.all([listAdapters(), listConnections(membership.organizationId)]);
  const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Real OAuth and API-key connections across email, calendar, e-signature, CRM sync, communication, storage,
          payments, accounting, meetings, development, and AI providers. A provider only ever shows Connected after a
          real token exchange or credential verification succeeds — never a simulated state.
        </p>
      </div>

      {params.connected && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
          Connected {params.connected} successfully.
        </div>
      )}
      {params.error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {params.error === "not_configured"
            ? `${params.provider} isn't configured yet — an admin needs to set its client id/secret in the environment first.`
            : params.error === "forbidden"
              ? "Only owners and admins can connect integrations."
              : `Connection failed: ${params.error}.`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adapters.map((adapter) => {
          const connection = connectionByProvider.get(adapter.key);
          const configured = adapter.isConfigured();
          const status = connection?.status ?? "NOT_CONNECTED";
          const Icon = CATEGORY_ICON[adapter.category];

          return (
            <Card key={adapter.key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <CardTitle className="text-base">{adapter.name}</CardTitle>
                  </div>
                  <StatusBadge status={status} configured={configured} />
                </div>
                <CardDescription>{CATEGORY_LABEL[adapter.category]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!configured && (
                  <p className="text-muted-foreground">
                    Requires <code className="rounded bg-muted px-1 py-0.5 text-xs">{adapter.requiredEnvVars.join(", ")}</code> to
                    be set.
                  </p>
                )}
                {connection?.status === "CONNECTED" && (
                  <div className="space-y-1 text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Last sync: {formatDateTime(connection.lastSyncAt)}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Last health check: {formatDateTime(connection.lastHealthCheckAt)}
                    </p>
                    {connection.scopes.length > 0 && <p>Scopes: {connection.scopes.join(", ")}</p>}
                  </div>
                )}
                {connection?.lastError && <p className="text-red-500">{connection.lastError}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                  {status === "NOT_CONNECTED" ? (
                    adapter.authType === "API_KEY" ? (
                      configured ? (
                        <ConnectApiKeyDialog provider={adapter.key} providerName={adapter.name} fields={adapter.credentialFields ?? []} />
                      ) : (
                        <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground/50">
                          Connect
                        </span>
                      )
                    ) : (
                      <a
                        href={configured ? `/api/integrations/${adapter.key}/connect` : undefined}
                        aria-disabled={!configured}
                        className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium ${
                          configured ? "text-foreground hover:bg-accent" : "cursor-not-allowed text-muted-foreground/50"
                        }`}
                      >
                        Connect
                      </a>
                    )
                  ) : (
                    <>
                      <form action={async () => { "use server"; await checkIntegrationHealth(adapter.key); }}>
                        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                          Check health
                        </button>
                      </form>
                      <form action={async () => { "use server"; await disconnectIntegration(adapter.key); }}>
                        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10">
                          Disconnect
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Container>
  );
}

function StatusBadge({ status, configured }: { status: string; configured: boolean }) {
  if (!configured) {
    return (
      <Badge variant="outline" className="gap-1">
        <XCircle className="size-3" /> Not configured
      </Badge>
    );
  }
  if (status === "CONNECTED") {
    return (
      <Badge variant="accent" className="gap-1">
        <CheckCircle2 className="size-3" /> Connected
      </Badge>
    );
  }
  if (status === "ERROR" || status === "EXPIRED") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600">
        <AlertTriangle className="size-3" /> {status === "EXPIRED" ? "Expired" : "Error"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <XCircle className="size-3" /> Not connected
    </Badge>
  );
}
