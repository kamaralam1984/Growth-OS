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

export type { TranslationKey, Dictionary };

/**
 * Same 10 locales already offered in the (formerly cosmetic-only) locale
 * selector — see src/app/dashboard/_components/locale-selector.tsx. These
 * are AI-generated translations of a deliberately small chrome key set (see
 * src/lib/i18n/keys.ts); functionally real (the UI text actually changes),
 * but a native-speaker review is recommended before shipping non-English
 * locales to production, especially ar/ur/hi (right-to-left/complex script).
 */
export const DICTIONARIES: Record<string, Dictionary> = { en, es, fr, de, pt, ar, hi, ur, zh, ja };

export const RTL_LOCALES = new Set(["ar", "ur"]);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

export function getDictionary(locale: string): Dictionary {
  return DICTIONARIES[locale] ?? en;
}
