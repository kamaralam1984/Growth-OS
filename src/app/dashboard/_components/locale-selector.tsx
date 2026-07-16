"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Languages } from "lucide-react";

import { Select } from "@/components/ui/select";
import { updateUserPreferences } from "@/app/profile/actions";

// Same locale list as src/app/profile/_components/preferences-form.tsx.
// Persists the preference (UserPreference.locale) and — via
// src/lib/i18n + TranslationProvider, wired in dashboard/layout.tsx — now
// actually translates the Command Center chrome (sidebar, Quick Actions,
// Command Palette, Notification Center). Module page bodies aren't wired
// through this yet and still render in English.
const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
  { value: "ur", label: "اردو" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
] as const;

export function LocaleSelector({ initialLocale }: { initialLocale: string }) {
  const { theme } = useTheme();
  const [locale, setLocale] = React.useState(initialLocale);
  const [pending, startTransition] = React.useTransition();

  function handleChange(value: string) {
    setLocale(value);
    startTransition(async () => {
      await updateUserPreferences({
        theme: (theme as "light" | "dark" | "system" | undefined) ?? "dark",
        locale: value,
      });
    });
  }

  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <Languages className="size-4 text-muted-foreground" />
      <Select
        aria-label="Language"
        value={locale}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 w-auto border-none bg-transparent pr-6 text-xs"
      >
        {LOCALE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
