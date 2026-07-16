import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getAdapter } from "@/lib/integrations/registry";
import { verifyState } from "@/lib/integrations/state";
import { saveConnection } from "@/lib/integrations/connection-store";
import type { IntegrationProviderKey } from "@/lib/integrations/types";

const callbackQuerySchema = z.object({ code: z.string().trim().min(1), state: z.string().trim().min(1) });

function redirectUriFor(request: Request, provider: string): string {
  return new URL(`/api/integrations/${provider}/callback`, new URL(request.url).origin).toString();
}

/**
 * OAuth callback — only ever marks a connection CONNECTED after a real
 * token exchange (adapter.handleCallback) succeeds. Any failure redirects
 * back to the Integration Management page with an honest error, never a
 * simulated success.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");

  const failRedirect = (reason: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings/integrations?error=${reason}&provider=${provider}`, request.url));

  if (providerError) return failRedirect(providerError);

  const parsedQuery = callbackQuerySchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsedQuery.success) return failRedirect("missing_code");
  const { code, state } = parsedQuery.data;

  const payload = verifyState(state);
  if (!payload) return failRedirect("invalid_state");

  const membership = await prisma.membership.findFirst({
    where: { userId: payload.userId, organizationId: payload.organizationId, status: "ACTIVE" },
  });
  if (!membership) return failRedirect("membership_not_found");

  let adapter;
  try {
    adapter = getAdapter(provider as IntegrationProviderKey);
  } catch {
    return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  }

  if (adapter.authType !== "OAUTH2" || !adapter.handleCallback) {
    return failRedirect("not_oauth_provider");
  }

  try {
    const tokens = await adapter.handleCallback(code, redirectUriFor(request, provider));
    await saveConnection(payload.organizationId, adapter.key, adapter.category, tokens, payload.userId);
    await logAudit({
      userId: payload.userId,
      organizationId: payload.organizationId,
      action: "integration.connected",
      metadata: { provider: adapter.key },
    });
  } catch (error) {
    console.error(`[integrations] callback failed for ${provider}:`, error);
    return failRedirect("token_exchange_failed");
  }

  return NextResponse.redirect(new URL(`/dashboard/settings/integrations?connected=${provider}`, request.url));
}
