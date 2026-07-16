import Link from "next/link";
import { LogOut } from "lucide-react";

import { Container } from "@/components/ui/container";
import { getClientPortalSession } from "@/lib/client-portal/auth";
import { portalLogout } from "./_lib/actions";
import { PortalNav } from "./_components/portal-nav";

/**
 * Chrome for every /portal/* route — deliberately does not redirect
 * unauthenticated visitors itself (same pattern as board/layout.tsx and
 * dashboard's chrome): /portal/login and /portal/verify must render without
 * a session, every other /portal/* page calls requireClientPortalSession()
 * itself.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getClientPortalSession();

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/portal/dashboard" className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
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
      {children}
    </div>
  );
}
