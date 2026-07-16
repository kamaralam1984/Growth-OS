import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { getAdapter } from "@/lib/integrations/registry";
import { signState } from "@/lib/integrations/state";
import type { IntegrationProviderKey } from "@/lib/integrations/types";

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

function redirectUriFor(request: Request, provider: string): string {
  return new URL(`/api/integrations/${provider}/callback`, new URL(request.url).origin).toString();
}

/** Starts a real OAuth consent flow — never shows a "Connected" state without the user actually completing this. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const membership = await resolveActiveMembership(userId);
  if (!membership || !PRIVILEGED_ROLES.has(membership.role)) {
    return NextResponse.redirect(new URL("/dashboard/settings/integrations?error=forbidden", request.url));
  }

  let adapter;
  try {
    adapter = getAdapter(provider as IntegrationProviderKey);
  } catch {
    return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  }

  if (adapter.authType !== "OAUTH2" || !adapter.getAuthUrl) {
    return NextResponse.json({ error: "This provider connects via credentials, not OAuth — use the Connect dialog on the Integrations page." }, { status: 400 });
  }

  if (!adapter.isConfigured()) {
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?error=not_configured&provider=${provider}`, request.url));
  }

  const state = signState(membership.organizationId, userId);
  const authUrl = adapter.getAuthUrl(state, redirectUriFor(request, provider));
  return NextResponse.redirect(authUrl);
}
