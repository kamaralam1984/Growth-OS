"use client";

import * as React from "react";

import { en } from "@/lib/i18n/keys";
import type { Dictionary, TranslationKey } from "@/lib/i18n";

// Defaults to the English dictionary (not null) so components shared with
// pages that don't mount <TranslationProvider> — e.g. NotificationBell also
// rendering on /board/* — still show real English text instead of a raw
// "notif.title"-style key.
const TranslationContext = React.createContext<Dictionary>(en);

/** Feeds the resolved dictionary (from UserPreference.locale, read server-side in dashboard/layout.tsx) down to client components. */
export function TranslationProvider({ dictionary, children }: { dictionary: Dictionary; children: React.ReactNode }) {
  return <TranslationContext.Provider value={dictionary}>{children}</TranslationContext.Provider>;
}

export function useT() {
  const dictionary = React.useContext(TranslationContext);
  return React.useCallback((key: TranslationKey): string => dictionary[key] ?? key, [dictionary]);
}
