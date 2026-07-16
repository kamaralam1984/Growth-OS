"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Smartphone, LogOut, ShieldCheck, Fingerprint } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { setPortalPassword, revokePortalSession, logoutEverywhere, toggleDeviceTrusted } from "../actions";

export interface SecurityDevice {
  id: string;
  label: string | null;
  trusted: boolean;
  lastSeenAt: string;
}

export interface SecuritySession {
  id: string;
  deviceLabel: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  lastActiveAt: string;
  isCurrent: boolean;
}

export function SecurityClient({
  hasPassword,
  devices,
  sessions,
}: {
  hasPassword: boolean;
  devices: SecurityDevice[];
  sessions: SecuritySession[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await setPortalPassword({ password, confirmPassword, currentPassword: currentPassword || undefined });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      router.refresh();
    });
  }

  function handleRevoke(sessionId: string) {
    startTransition(async () => {
      await revokePortalSession(sessionId);
      router.refresh();
    });
  }

  function handleLogoutEverywhere() {
    if (!confirm("Sign out of every other device? Your current session will stay signed in.")) return;
    startTransition(async () => {
      await logoutEverywhere();
      router.refresh();
    });
  }

  function handleToggleTrust(deviceId: string) {
    startTransition(async () => {
      await toggleDeviceTrusted(deviceId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> {hasPassword ? "Change password" : "Set a password"}
          </CardTitle>
          <CardDescription>
            {hasPassword ? "Update your password. You can always sign in with a magic link instead." : "Optional — magic link sign-in always works even without a password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="flex flex-col gap-3">
            {hasPassword && <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />}
            <Input type="password" placeholder="New password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            {error && <p className="text-xs text-destructive">{error}</p>}
            {success && <p className="text-xs text-primary">Password saved.</p>}
            <Button type="submit" size="sm" className="w-fit" disabled={pending || !password || !confirmPassword}>
              {pending ? "Saving…" : hasPassword ? "Update password" : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4" /> Sessions
            </CardTitle>
            <CardDescription>Every device currently signed in to your Client Portal account.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={handleLogoutEverywhere} disabled={pending}>
            <LogOut className="size-4" /> Log out everywhere
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
              <div>
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  {s.deviceLabel ?? "Unknown device"} {s.isCurrent && <Badge variant="accent">This device</Badge>} {s.rememberMe && <Badge variant="outline">Remembered</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.ipAddress ?? "Unknown IP"} · Last active {new Date(s.lastActiveAt).toLocaleString()}
                </p>
              </div>
              {!s.isCurrent && (
                <Button type="button" size="sm" variant="ghost" onClick={() => handleRevoke(s.id)} disabled={pending}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="size-4" /> Trusted devices
          </CardTitle>
          <CardDescription>Devices you&rsquo;ve used to sign in — mark ones you trust.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
              <div>
                <p className="text-sm text-foreground">{d.label ?? "Unknown device"}</p>
                <p className="text-xs text-muted-foreground">Last seen {new Date(d.lastSeenAt).toLocaleString()}</p>
              </div>
              <Button type="button" size="sm" variant={d.trusted ? "outline" : "ghost"} onClick={() => handleToggleTrust(d.id)} disabled={pending}>
                {d.trusted ? "Trusted" : "Trust this device"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Two-factor authentication &amp; Passkeys
          </CardTitle>
          <CardDescription>Coming soon — the architecture is in place, but sign-in verification isn&rsquo;t enabled yet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
            <span>Two-factor authentication (TOTP)</span>
            <Badge variant="outline">Coming soon</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
            <span>Passkeys</span>
            <Badge variant="outline">Coming soon</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
