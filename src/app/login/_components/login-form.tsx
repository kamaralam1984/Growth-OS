"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EffectiveBranding } from "@/lib/white-label/resolve-brand";

// Only ever redirect to a same-origin relative path (e.g. a preserved
// "/invite/accept?token=..." destination) — never to an absolute/external
// URL, to avoid turning this into an open redirect.
function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function LoginForm({ branding }: { branding: EffectiveBranding }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      code,
      remember: remember ? "true" : "false",
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      if (result.code === "totp_required") {
        setNeedsCode(true);
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }
      if (result.code === "totp_invalid") {
        setNeedsCode(true);
        setError("That code didn't match. Please try again.");
        return;
      }
      if (result.code === "account_locked") {
        setError(
          "This account is temporarily locked after too many failed sign-in attempts. Please try again later or reset your password.",
        );
        return;
      }
      setError(
        result.code === "rate_limited"
          ? "Too many sign-in attempts. Please try again in a few minutes."
          : "Invalid email or password.",
      );
      return;
    }
    router.push(callbackUrl ?? "/dashboard");
  }

  // Default copy says "GrowthOS" (this app's own name) exactly as before —
  // only swapped for the resolved org's real brand name when this request
  // actually matched a verified custom domain, never for every visitor.
  const productName = branding.isWhiteLabeled ? branding.brandName : "GrowthOS";

  return (
    <Card glass className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in to {productName}</CardTitle>
        <CardDescription>
          {branding.isWhiteLabeled && branding.customLoginHeadline
            ? branding.customLoginHeadline
            : "Welcome back — enter your details to continue."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {needsCode && (
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit authenticator code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- this field only appears after a prior submit revealed it's now required; focusing it isn't page-load focus-theft.
              autoFocus
              required
            />
          )}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={callbackUrl ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/register"}
            className="text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
