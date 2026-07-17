import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { sendVerificationEmail } from "@/lib/auth/verification-actions";
import { hashPassword } from "@/lib/auth/password";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

export async function POST(request: Request) {
  // Registration is a public, unauthenticated, DB-mutating endpoint — guard
  // it against abuse with a simple per-IP sliding window before doing any
  // real work.
  const rate = await checkRateLimitDegradable(`register:${clientIp(request)}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your details and try again." },
      { status: 400 },
    );
  }

  const { email, password, firstName, lastName, phone, country, language, timezone, jobTitle, image } =
    parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const hashed = await hashPassword(password);
  const name = `${firstName} ${lastName}`.trim();

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
      firstName,
      lastName,
      phone: phone || undefined,
      country: country || undefined,
      language: language || undefined,
      timezone: timezone || undefined,
      jobTitle: jobTitle || undefined,
      image: image || undefined,
    },
  });

  // Best-effort — a failed verification email must never block registration.
  try {
    await sendVerificationEmail(user.id, email);
  } catch (error) {
    console.error("[register] failed to send verification email:", error);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
