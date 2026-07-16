import { prisma } from "@/lib/prisma";
import { getWhiteLabelPlanAccess } from "./plan-access";

export interface EffectiveBranding {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
}

/** KVL GrowthOS's own default brand — mirrors src/components/brand/wordmark.tsx's "KVL GrowthOS" name; the mark/gradient colors there are CSS-variable driven (--color-emerald-400 etc.), not a stored hex value, so there's no single "default primaryColor" to fall back to — null is the honest answer, meaning "render this org's own default brand components, no override". */
const DEFAULT_BRAND_NAME = "KVL GrowthOS";

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
 * NOT YET WIRED IN: this function is the single real source of truth for
 * "what branding should this org see", but plugging it into every actual
 * rendering surface — the public login screen, dashboard chrome/favicon,
 * generated PDF footers, transactional emails — is a broader follow-up
 * integration that touches many files well outside src/lib/white-label/
 * and is out of this task's scope. This task delivers the correct
 * resolution function and the settings UI that populates it; a later pass
 * wires it into each rendering surface one at a time.
 */
export async function getEffectiveBranding(organizationId: string): Promise<EffectiveBranding> {
  const [settings, access] = await Promise.all([
    prisma.whiteLabelSettings.findUnique({ where: { organizationId } }),
    getWhiteLabelPlanAccess(organizationId),
  ]);

  if (!settings || !settings.enabled || !access.whiteLabelAccess) {
    return {
      brandName: DEFAULT_BRAND_NAME,
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
      secondaryColor: null,
      fontFamily: null,
    };
  }

  return {
    brandName: settings.brandName?.trim() || DEFAULT_BRAND_NAME,
    logoUrl: settings.logoStorageKey ? `/api/white-label/assets/${organizationId}/logo` : null,
    faviconUrl: settings.faviconStorageKey ? `/api/white-label/assets/${organizationId}/favicon` : null,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    fontFamily: settings.fontFamily,
  };
}
