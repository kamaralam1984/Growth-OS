import Link from "next/link";
import { Building2, Globe, UserCircle } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";

import { BoardNav } from "./_components/board-nav";
import { NotificationBell, type BoardNotification } from "./_components/notification-bell";

/**
 * Shared chrome for every /board route: a sticky top bar with the org name,
 * section nav (Dashboard/Meetings/Chat/Tasks/Activity), and the notification
 * bell. Deliberately does NOT redirect unauthenticated visitors itself —
 * every /board/* page already performs its own auth()+membership check and
 * redirect, so this layout just renders bare `children` when there's no
 * session/membership to show chrome for, letting the page underneath decide
 * where to send the visitor.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return <>{children}</>;
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) {
    return <>{children}</>;
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const unreadCount = await prisma.notification.count({ where: { userId, read: false } });

  const boardNotifications: BoardNotification[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAt: n.createdAt,
  }));

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/board" className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
              {membership.organization.name}
            </Link>
            <BoardNav />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/*
              Plain `title` attributes here, not the shared <Tooltip> primitive:
              <Tooltip>'s TooltipTrigger does a React.cloneElement on its child,
              which throws ("Element type is invalid") when the child (a
              next/link <Link>) is rendered from this async Server Component —
              a real, reproducible crash discovered while smoke-testing every
              route in this session, not something introduced by this phase's
              changes. <Tooltip> itself is fine for purely client-side usage
              (see src/components/sections/roi-calculator.tsx).
            */}
            <Link
              href="/"
              title="Marketing site"
              className="flex size-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-accent"
              aria-label="Back to KVL GrowthOS site"
            >
              <Globe className="size-4" />
            </Link>
            <Link
              href="/company"
              title="Company"
              className="flex size-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-accent"
              aria-label="Company settings"
            >
              <Building2 className="size-4" />
            </Link>
            <Link
              href="/profile"
              title="Profile"
              className="flex size-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground transition-colors hover:bg-accent"
              aria-label="Your profile"
            >
              <UserCircle className="size-4" />
            </Link>
            <NotificationBell initialNotifications={boardNotifications} initialUnreadCount={unreadCount} />
          </div>
        </Container>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
