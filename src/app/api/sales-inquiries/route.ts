import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { salesInquirySchema } from "@/lib/validations/sales-inquiry";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { dispatchWebhook } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

// Platform-level Slack/Teams/email notification for a brand-new inbound
// sales inquiry — same "best-effort, never throws" dispatch pattern as
// src/lib/monitoring/alerts.ts's dispatchPlatformWebhooks, reusing the exact
// same dispatchWebhook helper.
async function notifySalesTeam(title: string, message: string): Promise<void> {
  await Promise.all([
    dispatchWebhook(process.env.PLATFORM_SALES_SLACK_WEBHOOK_URL, title, message),
    dispatchWebhook(process.env.PLATFORM_SALES_TEAMS_WEBHOOK_URL, title, message),
  ]);
}

export async function POST(request: Request) {
  // Public, unauthenticated, DB-mutating endpoint — guard against abuse
  // before doing any real work. Tighter than /api/register since this is
  // lower-value, higher-spam-risk traffic.
  const rate = await checkRateLimitDegradable(`sales-inquiry:${clientIp(request)}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const parsed = salesInquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your details and try again." },
      { status: 400 },
    );
  }

  // Honeypot: real visitors never fill this hidden field. Report success
  // without writing a row or notifying anyone, so bots get no signal.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from `data` below (Prisma's SalesInquiry model has no `website` field).
  const { website: _website, ...data } = parsed.data;
  const sourcePage = request.headers.get("referer") ?? undefined;
  const referrer = request.headers.get("origin") ?? undefined;

  const inquiry = await prisma.salesInquiry.create({
    data: { ...data, sourcePage, referrer },
  });

  // Best-effort side effects — a failed notification must never fail the
  // visitor's submission (mirrors register/route.ts's verification-email
  // and photo-upload handling).
  try {
    await notifySalesTeam(
      "New sales inquiry",
      `${inquiry.name} (${inquiry.company}) — ${inquiry.department}\n${inquiry.businessEmail}\n\n${inquiry.message}`,
    );
  } catch (error) {
    console.error("[sales-inquiries] failed to notify sales team via webhook:", error);
  }

  try {
    await sendEmail({
      to: inquiry.businessEmail,
      subject: "We got your message — KVL GrowthOS",
      text: `Hi ${inquiry.name},\n\nThanks for reaching out to KVL GrowthOS. Our team has received your message and will get back to you shortly.\n\n— KVL GrowthOS`,
    });
  } catch (error) {
    console.error("[sales-inquiries] failed to send confirmation email:", error);
  }

  if (process.env.PLATFORM_SALES_EMAIL) {
    try {
      await sendEmail({
        to: process.env.PLATFORM_SALES_EMAIL,
        subject: `New inquiry: ${inquiry.company} (${inquiry.department})`,
        text: `${inquiry.name} <${inquiry.businessEmail}>\nCompany: ${inquiry.company}\nDepartment: ${inquiry.department}\n\n${inquiry.message}`,
      });
    } catch (error) {
      console.error("[sales-inquiries] failed to send internal notification email:", error);
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
