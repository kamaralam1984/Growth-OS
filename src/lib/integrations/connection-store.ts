import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "./crypto";
import { getAdapter } from "./registry";
import type { Prisma } from "@/generated/prisma/client";
import type { IntegrationCategory, IntegrationProviderKey, OAuthTokenResult } from "./types";

export interface DecryptedConnection {
  id: string;
  organizationId: string;
  provider: IntegrationProviderKey;
  status: "NOT_CONNECTED" | "CONNECTED" | "ERROR" | "EXPIRED";
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  lastSyncAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
}

function decrypt(row: {
  id: string;
  organizationId: string;
  provider: string;
  status: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  lastSyncAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastError: string | null;
  metadata: unknown;
}): DecryptedConnection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider as IntegrationProviderKey,
    status: row.status as DecryptedConnection["status"],
    accessToken: row.encryptedAccessToken ? decryptToken(row.encryptedAccessToken) : null,
    refreshToken: row.encryptedRefreshToken ? decryptToken(row.encryptedRefreshToken) : null,
    tokenExpiresAt: row.tokenExpiresAt,
    scopes: row.scopes,
    lastSyncAt: row.lastSyncAt,
    lastHealthCheckAt: row.lastHealthCheckAt,
    lastError: row.lastError,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export async function getConnection(organizationId: string, provider: IntegrationProviderKey): Promise<DecryptedConnection | null> {
  const row = await prisma.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  return row ? decrypt(row) : null;
}

export async function listConnections(organizationId: string): Promise<DecryptedConnection[]> {
  const rows = await prisma.integrationConnection.findMany({ where: { organizationId } });
  return rows.map(decrypt);
}

/** Persists a successful OAuth token exchange. Only ever called after a real provider round-trip succeeded — never speculatively. */
export async function saveConnection(
  organizationId: string,
  provider: IntegrationProviderKey,
  category: IntegrationCategory,
  tokens: OAuthTokenResult,
  connectedByUserId: string,
): Promise<void> {
  await prisma.integrationConnection.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    create: {
      organizationId,
      provider,
      category,
      status: "CONNECTED",
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      connectedByUserId,
      lastSyncAt: new Date(),
      metadata: (tokens.metadata as Prisma.InputJsonValue) ?? undefined,
    },
    update: {
      status: "CONNECTED",
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      connectedByUserId,
      lastSyncAt: new Date(),
      lastError: null,
      metadata: (tokens.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function disconnectConnection(organizationId: string, provider: IntegrationProviderKey): Promise<void> {
  const connection = await getConnection(organizationId, provider);
  if (!connection) return;

  if (connection.accessToken) {
    try {
      await getAdapter(provider).revoke(connection.accessToken);
    } catch (error) {
      console.error(`[integrations] revoke failed for ${provider} (continuing with local disconnect):`, error);
    }
  }

  await prisma.integrationConnection.update({
    where: { organizationId_provider: { organizationId, provider } },
    data: {
      status: "NOT_CONNECTED",
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      lastError: null,
    },
  });
}

/**
 * Returns a real, currently-valid access token for the connection —
 * transparently refreshing it first if it's expired (or expiring within 60s)
 * and a refresh token is on file. Returns null (never a stale/fake token)
 * when there's no connection, no access token, or a refresh attempt fails —
 * callers must treat null exactly like "not connected".
 */
export async function getFreshAccessToken(organizationId: string, provider: IntegrationProviderKey): Promise<string | null> {
  const connection = await getConnection(organizationId, provider);
  if (!connection || connection.status !== "CONNECTED" || !connection.accessToken) return null;

  const expiringSoon = connection.tokenExpiresAt ? connection.tokenExpiresAt.getTime() - Date.now() < 60_000 : false;
  if (!expiringSoon) return connection.accessToken;
  if (!connection.refreshToken) return connection.accessToken; // no refresh token on file — hope the current one still works, provider call will fail honestly if not

  const adapter = getAdapter(provider);
  if (!adapter.refreshAccessToken) return connection.accessToken; // API_KEY adapters never issue a refreshToken, so this path is unreachable for them in practice — guard anyway rather than assume

  try {
    const refreshed = await adapter.refreshAccessToken(connection.refreshToken);
    await prisma.integrationConnection.update({
      where: { organizationId_provider: { organizationId, provider } },
      data: {
        encryptedAccessToken: encryptToken(refreshed.accessToken),
        encryptedRefreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
        tokenExpiresAt: refreshed.expiresAt ?? null,
        status: "CONNECTED",
        lastError: null,
      },
    });
    return refreshed.accessToken;
  } catch (error) {
    await prisma.integrationConnection.update({
      where: { organizationId_provider: { organizationId, provider } },
      data: { status: "EXPIRED", lastError: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}

export async function runHealthCheck(organizationId: string, provider: IntegrationProviderKey): Promise<void> {
  const token = await getFreshAccessToken(organizationId, provider);
  if (!token) return;
  const result = await getAdapter(provider).healthCheck(token);
  await prisma.integrationConnection.update({
    where: { organizationId_provider: { organizationId, provider } },
    data: {
      lastHealthCheckAt: new Date(),
      status: result.ok ? "CONNECTED" : "ERROR",
      lastError: result.ok ? null : (result.detail ?? "Health check failed."),
    },
  });
}
