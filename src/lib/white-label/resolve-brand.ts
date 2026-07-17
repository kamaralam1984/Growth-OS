import { prisma } from "@/lib/prisma";
import { getWhiteLabelPlanAccess } from "./plan-access";

export interface EffectiveBranding {
  /** True only when a real WhiteLabelSettings row is enabled AND the org's current plan is entitled — every other field below reflects the platform default when this is false. */
  isWhiteLabeled: boolean;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
  customLoginHeadline: string | null;
  emailFromName: string | null;
  emailFromAddress: string | null;
  pdfFooterText: string | null;
}

/** KVL GrowthOS's own default brand — mirrors src/components/brand/wordmark.tsx's "KVL GrowthOS" name; the mark/gradient colors there are CSS-variable driven (--color-emerald-400 etc.), not a stored hex value, so there's no single "default primaryColor" to fall back to — null is the honest answer, meaning "render this org's own default brand components, no override". */
const DEFAULT_BRAND_NAME = "KVL GrowthOS";

/** The honest, shared "no white-label applies" result — every early-return branch in this file returns this exact object rather than each re-listing the same null fields. */
const DEFAULT_BRANDING: EffectiveBranding = {
  isWhiteLabeled: false,
  brandName: DEFAULT_BRAND_NAME,
  logoUrl: null,
  faviconUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontFamily: null,
  customLoginHeadline: null,
  emailFromName: null,
  emailFromAddress: null,
  pdfFooterText: null,
};

/**
 * Resolves the branding a given organization should actually see/emit —
 * real WhiteLabelSettings values when, and only when, BOTH of these are
 * true right now:
 *   1. the org's real, CURRENT plan grants whiteLabelAccess (re-checked
 *      here, not just at the settings-page gate, so a downgraded org
 *      silently stops receiving white-labeled output the moment its plan
 *      no longer includes the feature — even if `enabled` is still true in
 *      the row — with no separate cleanup/migration step required), and
 *   2. the org has explicitly turned `enabled` on for its settings row.
 * Falls back to KVL GrowthOS's own default brand otherwise.
 *
 * This is the single real source of truth for "what branding should this
 * org see" — dashboard chrome, the client portal, generated PDF footers,
 * transactional emails, and (via resolveBrandByHost below) the public
 * pre-login pages all resolve through this same function or its host-based
 * wrapper. Per-organization favicon on the authenticated dashboard shell
 * remains a documented, bounded scope limit — see the white-label guide.
 */
export async function getEffectiveBranding(organizationId: string): Promise<EffectiveBranding> {
  const [settings, access] = await Promise.all([
    prisma.whiteLabelSettings.findUnique({ where: { organizationId } }),
    getWhiteLabelPlanAccess(organizationId),
  ]);

  if (!settings || !settings.enabled || !access.whiteLabelAccess) {
    return DEFAULT_BRANDING;
  }

  return {
    isWhiteLabeled: true,
    brandName: settings.brandName?.trim() || DEFAULT_BRAND_NAME,
    logoUrl: settings.logoStorageKey ? `/api/white-label/assets/${organizationId}/logo` : null,
    faviconUrl: settings.faviconStorageKey ? `/api/white-label/assets/${organizationId}/favicon` : null,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    fontFamily: settings.fontFamily,
    customLoginHeadline: settings.customLoginHeadline?.trim() || null,
    emailFromName: settings.emailFromName?.trim() || null,
    emailFromAddress: settings.emailFromAddress?.trim() || null,
    pdfFooterText: settings.pdfFooterText?.trim() || null,
  };
}

/** Strips a possible `:port` suffix and lowercases — Host headers are case-insensitive and, unlike `CustomDomain.domain` rows (which are stored as bare hostnames), a browser's Host header includes the port whenever the app isn't served on the default 80/443 (e.g. local dev, a non-standard reverse-proxy port). Returns null for an empty/missing header so callers can short-circuit straight to the default branding without a wasted query. */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const withoutPort = host.split(":")[0]?.trim().toLowerCase();
  return withoutPort || null;
}

/**
 * Real host-only branding resolution for PRE-LOGIN public pages (login,
 * register, forgot/reset password, the client-portal login) — there is no
 * authenticated session or org membership yet at this point, so the only
 * trustworthy signal available is the request's own Host header, matched
 * against a real `CustomDomain` row.
 *
 * Deliberately requires `status === "VERIFIED"` — a row merely existing
 * (e.g. still `PENDING`) only means someone typed that domain into the
 * "Add custom domain" form, not that they've proven DNS control of it (see
 * src/lib/white-label/domains.ts's verifyCustomDomain). Resolving real
 * branding off an unverified row would let anyone claim an unowned/
 * not-yet-proven domain and have this app hand back another org's real
 * name/logo — a tenant-isolation and phishing-surface issue, not just a
 * cosmetic one. Every other case (no matching row, PENDING/FAILED status,
 * or a matched org whose plan/settings don't currently entitle it — that
 * last check happens inside getEffectiveBranding itself, same as every
 * other caller) falls through to the same honest default every unbranded
 * request already gets.
 */
export async function resolveBrandByHost(host: string | null | undefined): Promise<EffectiveBranding> {
  const domain = normalizeHost(host);
  if (!domain) return DEFAULT_BRANDING;

  const customDomain = await prisma.customDomain.findUnique({
    where: { domain },
    include: { whiteLabelSettings: true },
  });

  if (!customDomain || customDomain.status !== "VERIFIED") {
    return DEFAULT_BRANDING;
  }

  return getEffectiveBranding(customDomain.whiteLabelSettings.organizationId);
}

/**
 * Real "From" name/address for an org's outbound emails when white-labeled
 * — null (meaning: use the platform default) unless BOTH emailFromName and
 * emailFromAddress are actually set, since a From header needs both parts
 * to be meaningful. Thin, single-purpose wrapper over getEffectiveBranding
 * so email call sites don't each re-derive this same "both fields present"
 * check independently.
 */
export async function getWhiteLabelEmailFrom(organizationId: string): Promise<{ name: string; address: string } | null> {
  const branding = await getEffectiveBranding(organizationId);
  if (!branding.emailFromName || !branding.emailFromAddress) return null;
  return { name: branding.emailFromName, address: branding.emailFromAddress };
}
