"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { fadeInUp } from "@/animations";
import { COMMON_LANGUAGES } from "@/lib/constants/onboarding";
import { ALL_COUNTRIES, TIMEZONE_GROUPS } from "@/lib/constants/timezones";
import type { EffectiveBranding } from "@/lib/white-label/resolve-brand";
import type { EnabledOAuthProviders } from "@/lib/auth/oauth-providers";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { compressImageIfNeeded, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES } from "./compress-image";

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
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Revoke the blob: preview URL when the component unmounts (or a new one
  // replaces it) — otherwise it leaks for the tab's lifetime.
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Real client-side validation + compression, so a 15MB phone photo isn't
  // sent over the wire at full size — the actual upload cap (20MB) is
  // enforced again server-side in saveUserAvatar, never trusted from the
  // client alone.
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Use PNG, JPEG, WebP, GIF, or AVIF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Photo must be ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))}MB or smaller.`);
      e.target.value = "";
      return;
    }

    setCompressing(true);
    const finalFile = await compressImageIfNeeded(file).catch(() => file);
    setCompressing(false);

    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhoto(finalFile);
    setPhotoPreviewUrl(URL.createObjectURL(finalFile));
  }

  function clearPhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhoto(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, value);
    if (photo) body.append("photo", photo);

    const response = await fetch("/api/register", { method: "POST", body });

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
                  {ALL_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.name}>
                      {country.name}
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
              <FormField label="Timezone" htmlFor="timezone">
                <Select
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                >
                  <option value="">Select a timezone</option>
                  {TIMEZONE_GROUPS.map((group) => (
                    <optgroup key={group.countryName} label={group.countryName}>
                      {group.timezones.map((tz) => (
                        <option key={tz.name} value={tz.name}>
                          {tz.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </FormField>

              <FormField label="Photo" htmlFor="photo" hint="PNG, JPEG, WebP, GIF, or AVIF — up to 20MB, compressed automatically.">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="photo"
                    type="file"
                    accept={ALLOWED_PHOTO_TYPES.join(",")}
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  {photoPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob: preview URL, not an optimizable static asset
                    <img src={photoPreviewUrl} alt="Selected profile" className="size-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground">
                      <ImagePlus className="size-4" />
                    </span>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={compressing}>
                    {compressing ? "Compressing..." : photo ? "Change" : "Upload photo"}
                  </Button>
                  {photo && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Remove selected photo"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {photo && !photoError && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {photo.name} — {formatBytes(photo.size)}
                  </p>
                )}
                {photoError && <p className="mt-1 text-xs text-destructive">{photoError}</p>}
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
