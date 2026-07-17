import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getLiveExchangeRate } from "@/lib/billing/exchange-rates";

/**
 * Thin, auth-gated read endpoint over getLiveExchangeRate
 * (src/lib/billing/exchange-rates.ts) — exists purely so client components
 * (the subscription page's plan comparison) can show a live-rate
 * informational aside without a real Redis/ioredis connection running in
 * the browser. Display-only: the returned rate never feeds checkout or
 * webhook charge amounts, only an "≈" hint next to the real, fixed price.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = (searchParams.get("from") ?? "").toUpperCase();
  const to = (searchParams.get("to") ?? "").toUpperCase();

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return NextResponse.json({ error: "Invalid currency code" }, { status: 400 });
  }

  const rate = await getLiveExchangeRate(from, to);
  return NextResponse.json({ rate });
}
