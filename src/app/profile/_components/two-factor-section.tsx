"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { startTwoFactorEnrollment, confirmTwoFactorEnrollment, disableTwoFactor } from "../actions";

export interface TwoFactorSectionProps {
  initialEnabled: boolean;
}

export function TwoFactorSection({ initialEnabled }: TwoFactorSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startTwoFactorEnrollment();
      if (!result.ok || !result.secret || !result.qrCodeDataUrl) {
        setError(result.error ?? "Could not start 2FA setup.");
        return;
      }
      setEnrollment({ secret: result.secret, qrCodeDataUrl: result.qrCodeDataUrl });
    });
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmTwoFactorEnrollment({ code });
      if (!result.ok) {
        setError(result.error ?? "Invalid code.");
        return;
      }
      setEnabled(true);
      setEnrollment(null);
      setCode("");
    });
  }

  function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await disableTwoFactor(disablePassword);
      if (!result.ok) {
        setError(result.error ?? "Could not disable 2FA.");
        return;
      }
      setEnabled(false);
      setEnrollment(null);
      setDisabling(false);
      setDisablePassword("");
    });
  }

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="accent">
            <ShieldCheck className="size-3.5" /> Enabled
          </Badge>
          <p className="text-sm text-muted-foreground">
            Two-factor authentication is protecting your account.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {disabling ? (
          <form onSubmit={handleDisable} className="flex flex-col gap-3">
            <FormField label="Confirm your current password" htmlFor="disable-2fa-password" required>
              <Input
                id="disable-2fa-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" variant="outline" disabled={pending || disablePassword.length === 0}>
                {pending ? "Disabling..." : "Confirm disable"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDisabling(false);
                  setDisablePassword("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="outline" onClick={() => setDisabling(true)} disabled={pending}>
              Disable 2FA
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (enrollment) {
    return (
      <form onSubmit={handleConfirm} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, ...),
          or enter the secret manually.
        </p>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Image
            src={enrollment.qrCodeDataUrl}
            alt="2FA QR code"
            width={160}
            height={160}
            unoptimized
            className="rounded-lg border border-border bg-white p-2"
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Manual entry key
            </span>
            <code className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
              {enrollment.secret}
            </code>
          </div>
        </div>

        <FormField label="6-digit code" htmlFor="totp-code" required>
          <Input
            id="totp-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            required
          />
        </FormField>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={pending || code.length !== 6}>
            {pending ? "Verifying..." : "Confirm & enable"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEnrollment(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Add an extra layer of security to your account with an authenticator app.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="button" onClick={handleStart} disabled={pending}>
          {pending ? "Starting..." : "Set up 2FA"}
        </Button>
      </div>
    </div>
  );
}
