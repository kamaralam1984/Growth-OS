"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { fadeInUp } from "@/animations";
import { COMMON_COUNTRIES, COMMON_LANGUAGES } from "@/lib/constants/onboarding";
import type { EffectiveBranding } from "@/lib/white-label/resolve-brand";
import type { EnabledOAuthProviders } from "@/lib/auth/oauth-providers";
import { PasswordStrengthMeter } from "./password-strength-meter";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  language: string;
  timezone: string;
  jobTitle: string;
  image: string;
}

const INITIAL_STATE: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
  country: "",
  language: "",
  timezone: "",
  jobTitle: "",
  image: "",
};

// Only ever redirect to a same-origin relative path (e.g. a preserved
// "/invite/accept?token=..." destination) — never to an absolute/external
// URL, to avoid turning this into an open redirect.
function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function RegisterForm({
  branding,
  oauthProviders,
}: {
  branding: EffectiveBranding;
  oauthProviders: EnabledOAuthProviders;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Phase 18 reseller referral capture: a visitor arriving via a partner's
  // referral link (e.g. /register?ref=ABC123) gets that code stashed in a
  // short-lived, non-httpOnly cookie. It's consumed once — real Partner
  // lookup and all — at actual Organization-creation time in
  // src/app/onboarding/actions.ts's createOrContinueOrganization, since
  // registering here only ever creates the User, not the Organization.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      document.cookie = `growthos_ref=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 30}`;
    }
  }, [searchParams]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      router.push(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
      return;
    }
    router.push(callbackUrl ?? "/onboarding");
  }

  const productName = branding.isWhiteLabeled ? branding.brandName : null;

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="w-full max-w-2xl">
      <Card glass className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            {productName
              ? `Start running your growth engine on autopilot with ${productName} — a few details, then your AI workforce goes to work.`
              : "Start running your growth engine on autopilot — a few details, then your AI workforce goes to work."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" htmlFor="firstName" required>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="Jane"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Last name" htmlFor="lastName" required>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  required
                />
              </FormField>
            </div>

            <FormField label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                placeholder="jane@yourcompany.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </FormField>

            <FormField label="Password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters, with a number"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                minLength={8}
                required
              />
              <PasswordStrengthMeter password={form.password} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Job title" htmlFor="jobTitle">
                <Input
                  id="jobTitle"
                  type="text"
                  placeholder="Founder, Sales Lead, ..."
                  value={form.jobTitle}
                  onChange={(e) => set("jobTitle", e.target.value)}
                />
              </FormField>
              <FormField label="Phone" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 555 010 2020"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Country" htmlFor="country">
                <Select
                  id="country"
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                >
                  <option value="">Select a country</option>
                  {COMMON_COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Preferred language" htmlFor="language">
                <Select
                  id="language"
                  value={form.language}
                  onChange={(e) => set("language", e.target.value)}
                >
                  <option value="">Select a language</option>
                  {COMMON_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Timezone"
                htmlFor="timezone"
                hint="IANA name, e.g. America/New_York or Asia/Karachi."
              >
                <Input
                  id="timezone"
                  type="text"
                  placeholder="e.g. America/New_York"
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                />
              </FormField>
              <FormField label="Photo URL" htmlFor="image">
                <Input
                  id="image"
                  type="url"
                  placeholder="https://..."
                  value={form.image}
                  onChange={(e) => set("image", e.target.value)}
                />
              </FormField>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-2">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <div className="mt-6">
            <OAuthButtons providers={oauthProviders} callbackUrl={callbackUrl} />
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"}
              className="text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
