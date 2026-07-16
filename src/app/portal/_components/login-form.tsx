"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requestMagicLink, loginWithPassword } from "../_lib/actions";

export function PortalLoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestMagicLink({ email });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
    });
  }

  function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginWithPassword({ email, password, rememberMe });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(result.redirectTo ?? callbackUrl ?? "/portal/dashboard");
    });
  }

  if (sent) {
    return (
      <Card glass className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Mail className="size-8 text-primary" />
          <p className="text-lg font-semibold text-foreground">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a real sign-in link to <strong>{email}</strong>. It expires in 30 minutes and works once.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Client Portal</CardTitle>
        <CardDescription>{mode === "magic" ? "We'll email you a real, secure sign-in link — no password needed." : "Sign in with your email and password."}</CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "magic" ? (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending ? "Sending…" : "Send sign-in link"} <ArrowRight className="size-4" />
            </Button>
            <button type="button" onClick={() => setMode("password")} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Lock className="size-3" /> Sign in with a password instead
            </button>
          </form>
        ) : (
          <form onSubmit={handlePassword} className="flex flex-col gap-3">
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me on this device
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || !email.trim() || !password}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
            <button type="button" onClick={() => setMode("magic")} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Mail className="size-3" /> Email me a sign-in link instead
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
