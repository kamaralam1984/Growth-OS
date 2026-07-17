import { prisma } from "@/lib/prisma";
import type { IntegrationProviderKey } from "@/generated/prisma/client";
import type { IntegrationConnectorManifest } from "../manifest-schema";

export interface IntegrationConnectorInstallResult {
  /** No real IntegrationConnection exists yet — only a real OAuth/API-key exchange creates one. */
  integrationConnectionId: string | null;
  connectUrl: string;
}

/**
 * Does NOT create an IntegrationConnection itself — that would fabricate a
 * "connected" state with no real credential behind it. Returns a deep link
 * to the existing Integration Hub connect flow; reconcileIntegrationInstall()
 * below flips createdRowsLog.integrationConnectionId once a real CONNECTED
 * row appears for this org+provider.
 */
export async function installIntegrationConnector(organizationId: string, manifest: IntegrationConnectorManifest): Promise<IntegrationConnectorInstallResult> {
  const existing = await prisma.integrationConnection.findFirst({
    where: { organizationId, provider: manifest.provider as IntegrationProviderKey, status: "CONNECTED" },
    select: { id: true },
  });

  return {
    integrationConnectionId: existing?.id ?? null,
    connectUrl: `/dashboard/settings/integrations?provider=${manifest.provider}`,
  };
}

/**
 * Called on marketplace page load for any install still missing a real
 * connection — cheap existence check, not a scheduled job, since it only
 * matters when the user is actually looking at the page.
 */
export async function reconcileIntegrationInstall(organizationId: string, provider: IntegrationProviderKey): Promise<string | null> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { organizationId, provider, status: "CONNECTED" },
    select: { id: true },
  });
  return connection?.id ?? null;
}
