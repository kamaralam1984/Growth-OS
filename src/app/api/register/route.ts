import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { sendVerificationEmail } from "@/lib/auth/verification-actions";
import { hashPassword } from "@/lib/auth/password";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { saveUserAvatar } from "@/lib/storage/avatars";

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

  // Multipart form (not JSON) so a real photo File can ride along with the
  // text fields — see register-form.tsx's handleSubmit.
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const textFields = Object.fromEntries(
    ["email", "password", "firstName", "lastName", "phone", "country", "language", "timezone", "jobTitle"].map(
      (key) => {
        const value = formData.get(key);
        return [key, typeof value === "string" ? value : undefined];
      },
    ),
  );
  const parsed = registerSchema.safeParse(textFields);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your details and try again." },
      { status: 400 },
    );
  }

  const { email, password, firstName, lastName, phone, country, language, timezone, jobTitle } = parsed.data;

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
    },
  });

  // Best-effort — a failed photo upload must never block account creation;
  // the user can always add/change a photo later from profile settings.
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      const { storageKey } = await saveUserAvatar(user.id, photo);
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarStorageKey: storageKey, image: `/api/users/${user.id}/avatar` },
      });
    } catch (error) {
      console.error("[register] failed to save profile photo:", error);
    }
  }

  // Best-effort — a failed verification email must never block registration.
  try {
    await sendVerificationEmail(user.id, email);
  } catch (error) {
    console.error("[register] failed to send verification email:", error);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
