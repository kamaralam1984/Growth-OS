import Link from "next/link";
import { LogOut } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getClientPortalSession } from "@/lib/client-portal/auth";
import { getEffectiveBranding } from "@/lib/white-label/resolve-brand";
import { portalLogout } from "./_lib/actions";
import { PortalNav } from "./_components/portal-nav";

/**
 * Chrome for every /portal/* route — deliberately does not redirect
 * unauthenticated visitors itself (same pattern as board/layout.tsx and
 * dashboard's chrome): /portal/login and /portal/verify must render without
 * a session, every other /portal/* page calls requireClientPortalSession()
 * itself.
 *
 * White Label (Phase 20): the Client Portal is the single surface a client
 * actually sees this app's own branding on today — getEffectiveBranding()
 * shows the agency's real logo when white-labeling is enabled/entitled,
 * falling back to no logo (never "KVL GrowthOS" — this page never
 * hardcoded that name to begin with).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getClientPortalSession();

  if (!session) {
    return <>{children}</>;
  }

  const branding = await getEffectiveBranding(session.organizationId);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/portal/dashboard" className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              {branding.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- org-uploaded asset, not a static/optimizable local image
                <img src={branding.logoUrl} alt={branding.brandName} className="h-6 w-auto" />
              )}
              {session.client.name}
            </Link>
            <PortalNav />
          </div>
          <form action={portalLogout}>
            <button type="submit" className="flex size-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-accent" aria-label="Log out">
              <LogOut className="size-4" />
            </button>
          </form>
        </Container>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
