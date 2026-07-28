/**
 * Single source of truth for this deployment's own public base URL —
 * consumed by src/app/sitemap.ts, src/app/robots.ts, src/app/layout.tsx, and
 * the marketing footer's "Website" link, so the real production domain only
 * ever lives in one place instead of being copy-pasted (and hardcoded wrong)
 * across several files independently.
 */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://growthos.kvlbusinesssolutions.com";
}
