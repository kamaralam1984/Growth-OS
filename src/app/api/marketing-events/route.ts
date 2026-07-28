import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { marketingEventSchema } from "@/lib/validations/marketing-event";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

// Public, unauthenticated, low-stakes telemetry endpoint — nothing sensitive
// is created, but a loose per-IP limit still stops a runaway client-side
// loop (e.g. a buggy scroll-depth hook) from flooding the table.
export async function POST(request: Request) {
  const rate = await checkRateLimitDegradable(`marketing-event:${clientIpFromHeaders(request.headers)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = marketingEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await prisma.marketingEvent.create({
    data: {
      eventType: parsed.data.eventType,
      page: parsed.data.page,
      label: parsed.data.label,
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
      sessionId: parsed.data.sessionId,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
