"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/app/register/_components/password-strength-meter";

// This page's instructional copy is deliberately never swapped for an org's
// customLoginHeadline (unlike the actual login page) — it explains a
// specific action ("choose a new password"), not a welcome message. The
// logo/theme-color branding this page does apply lives in page.tsx
// (PublicBrandHeader / brandThemeStyle), wrapping this form from the
// outside.
export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (!token) {
    return (
      <Card glass className="w-full max-w-sm">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          This reset link is missing its token.{" "}
          <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
            Request a new one
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Set a new password</CardTitle>
        <CardDescription>
          {done ? "Password updated — redirecting you to sign in." : "Choose a new password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!done && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="password"
              placeholder="At least 8 characters, with a number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <PasswordStrengthMeter password={password} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-2">
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
