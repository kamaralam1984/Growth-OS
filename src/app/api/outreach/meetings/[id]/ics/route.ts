import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildIcsInvite } from "@/lib/outreach/ics";

const DEFAULT_DURATION_MINUTES = 30;

/** Real, spec-correct .ics download for a confirmed OutreachMeeting — auth-gated, same ownership-check convention as api/export routes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !session.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meeting = await prisma.outreachMeeting.findUnique({ where: { id }, include: { contact: true } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: meeting.organizationId } } });
  if (!membership || membership.status !== "ACTIVE") return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!meeting.scheduledAt) return NextResponse.json({ error: "This meeting doesn't have a confirmed time yet." }, { status: 400 });

  const ics = buildIcsInvite({
    title: meeting.title,
    description: meeting.agenda ?? undefined,
    startsAt: meeting.scheduledAt,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    organizerEmail: session.user.email,
    attendeeEmail: meeting.contact.email,
  });

  await prisma.outreachMeeting.update({ where: { id }, data: { icsGenerated: true } });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meeting.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.ics"`,
    },
  });
}
