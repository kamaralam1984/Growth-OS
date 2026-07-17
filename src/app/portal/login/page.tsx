import { headers } from "next/headers";

import { PublicBrandHeader, brandThemeStyle } from "@/components/brand/public-brand-header";
import { resolveBrandByHost } from "@/lib/white-label/resolve-brand";
import { PortalLoginForm } from "../_components/login-form";

/**
 * Real host-based white-label resolution for this pre-login page — there's
 * no client-portal session yet (src/app/portal/layout.tsx only resolves
 * branding once a session exists), so branding here is resolved purely from
 * the request's own Host header against a verified CustomDomain row
 * (resolveBrandByHost). Falls back to the exact same unbranded UI as before
 * when no verified custom domain matches this host.
 */
export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const host = (await headers()).get("host");
  const branding = await resolveBrandByHost(host);

  return (
    <main
      className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 py-16"
      style={brandThemeStyle(branding)}
    >
      <PublicBrandHeader branding={branding} />
      <PortalLoginForm callbackUrl={callbackUrl} branding={branding} />
    </main>
  );
}
