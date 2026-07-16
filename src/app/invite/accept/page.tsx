import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { acceptInvitation } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SALES: "Sales",
  MARKETING: "Marketing",
  DEVELOPER: "Developer",
  SUPPORT: "Support",
  FINANCE: "Finance",
  HR: "HR",
  VIEWER: "Viewer",
  AI_AGENT: "AI Agent",
};

function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <Card glass className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    return (
      <StatusCard
        title="Invalid invitation link"
        message="This invitation link is missing its token. Ask whoever invited you to resend the link."
      />
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invitation) {
    return (
      <StatusCard
        title="Invalid invitation link"
        message="We couldn't find an invitation for this link. It may have been mistyped or already removed."
      />
    );
  }

  if (invitation.status === "ACCEPTED") {
    return (
      <StatusCard
        title="Already accepted"
        message="This invitation has already been accepted. Sign in to access the organization."
      />
    );
  }

  if (invitation.status === "REVOKED") {
    return (
      <StatusCard
        title="Invitation revoked"
        message="This invitation has been revoked by an admin. Ask them to send a new one if this was unexpected."
      />
    );
  }

  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    return (
      <StatusCard
        title="Invitation expired"
        message="This invitation link has expired. Ask an admin at the organization to send you a new one."
      />
    );
  }

  const session = await auth();
  const callbackUrl = `/invite/accept?token=${encodeURIComponent(token)}`;

  if (!session?.user) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6">
        <Card glass className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">You&apos;ve been invited</CardTitle>
            <CardDescription>
              Join <span className="text-foreground">{invitation.organization.name}</span> on GrowthOS as{" "}
              <Badge variant="accent" className="align-middle">
                {ROLE_LABELS[invitation.role] ?? invitation.role}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Create account</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <Container className="flex justify-center">
        <Card glass className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Join {invitation.organization.name}</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join as{" "}
              <Badge variant="accent" className="align-middle">
                {ROLE_LABELS[invitation.role] ?? invitation.role}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={acceptInvitation.bind(null, token)} className="w-full">
              <Button type="submit" className="w-full">
                Accept invitation
              </Button>
            </form>
          </CardFooter>
        </Card>
      </Container>
    </main>
  );
}
