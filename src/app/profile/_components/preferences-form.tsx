"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, SunMoon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserPreferencesInput } from "@/lib/validations/profile";
import { updateUserPreferences } from "../actions";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: SunMoon },
] as const;

// Locale codes (not full language names — kept distinct from the
// full-name `User.language` picker used at registration/onboarding).
// No real i18n/translation infrastructure exists yet; this only persists
// the preference for a future release to act on.
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

export interface PreferencesFormProps {
  initial: UserPreferencesInput;
}

export function PreferencesForm({ initial }: PreferencesFormProps) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState(initial.locale);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const activeTheme = mounted ? (theme ?? initial.theme) : initial.theme;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateUserPreferences({
        theme: (activeTheme as "light" | "dark" | "system") ?? "dark",
        locale,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Personalize how GrowthOS looks and reads to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Theme" htmlFor="theme">
            <div className="flex gap-2" id="theme">
              {THEME_OPTIONS.map((option) => {
                const isActive = activeTheme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setTheme(option.value);
                      setSuccess(false);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-card"
                        : "border-border bg-transparent text-foreground hover:bg-accent",
                    )}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField label="Language" htmlFor="locale">
            <Select
              id="locale"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value);
                setSuccess(false);
              }}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save preferences"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
