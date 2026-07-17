import { en, type Dictionary, type TranslationKey } from "./keys";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { de } from "./dictionaries/de";
import { pt } from "./dictionaries/pt";
import { ar } from "./dictionaries/ar";
import { hi } from "./dictionaries/hi";
import { ur } from "./dictionaries/ur";
import { zh } from "./dictionaries/zh";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";

export type { TranslationKey, Dictionary };

/**
 * Same locales already offered in the (formerly cosmetic-only) locale
 * selector — see src/app/dashboard/_components/locale-selector.tsx. These
 * are AI-generated translations of a deliberately small chrome key set (see
 * src/lib/i18n/keys.ts); functionally real (the UI text actually changes),
 * but a native-speaker review is recommended before shipping non-English
 * locales to production, especially ar/ur/hi/ko (right-to-left or complex
 * script). `ur` predates Phase 20's explicit language list and is kept
 * (additive-only — never remove a shipped locale); `ko` is Phase 20's
 * addition to reach that list.
 */
export const DICTIONARIES: Record<string, Dictionary> = { en, es, fr, de, pt, ar, hi, ur, zh, ja, ko };

export const RTL_LOCALES = new Set(["ar", "ur"]);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

export function getDictionary(locale: string): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

// Organization.primaryLanguage (set at onboarding, see
// src/lib/constants/onboarding.ts's COMMON_LANGUAGES) stores a free-text
// display name, not an ISO locale code — this maps the subset that has a
// real dictionary above. A language picked at onboarding but not in
// DICTIONARIES (Russian, Italian, Dutch) honestly falls back to English
// rather than guessing.
const LANGUAGE_NAME_TO_LOCALE: Record<string, string> = {
  English: "en",
  Spanish: "es",
  French: "fr",
  German: "de",
  Portuguese: "pt",
  Arabic: "ar",
  Hindi: "hi",
  Urdu: "ur",
  "Mandarin Chinese": "zh",
  Japanese: "ja",
  Korean: "ko",
};

/**
 * Real per-org default: an org's `primaryLanguage` (an onboarding-time
 * display name) is only ever used when a user hasn't set their own
 * UserPreference.locale — see src/app/dashboard/layout.tsx. Returns null,
 * never a guess, when the org has no primaryLanguage or it isn't one of
 * the languages this app actually has a dictionary for.
 */
export function localeForOrganizationLanguage(primaryLanguage: string | null | undefined): string | null {
  if (!primaryLanguage) return null;
  return LANGUAGE_NAME_TO_LOCALE[primaryLanguage] ?? null;
}

/**
 * Parses a real `Accept-Language` request header (RFC 9110 §12.5.4 — a
 * comma-separated list of language tags, each optionally weighted by
 * `;q=0..1`) and returns the highest-quality tag that this app actually has
 * a dictionary for. Only ever used as the LAST fallback, after an explicit
 * UserPreference.locale and an org's primaryLanguage (see
 * src/app/dashboard/layout.tsx) — a browser default should never override
 * something a user or org admin actually chose. Returns null, never a
 * guess, when the header is absent/unparseable or matches no real
 * dictionary.
 */
export function localeFromAcceptLanguageHeader(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;

  const tags = headerValue
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const quality = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 1 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of tags) {
    const primary = tag.split("-")[0];
    if (primary in DICTIONARIES) return primary;
  }
  return null;
}
