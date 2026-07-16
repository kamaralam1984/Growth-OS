"use client";

import { useState, useTransition } from "react";
import { Download, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import { anonymizeMyAccountAction, exportMyDataAction } from "../dsr-actions";

const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export interface PrivacyDataSectionProps {
  hasPassword: boolean;
}

/**
 * Self-service Data Subject Request (DSR) tab — GDPR/CCPA/DPDP-India "right
 * to access/portability" and "right to erasure", reachable directly from
 * account settings. See src/app/profile/dsr-actions.ts for what each action
 * actually does (a real JSON export, a real anonymization — not stubs).
 */
export function PrivacyDataSection({ hasPassword }: PrivacyDataSectionProps) {
  const [exporting, startExportTransition] = useTransition();
  const [erasing, startEraseTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    startExportTransition(async () => {
      const result = await exportMyDataAction();
      if (!result.ok || !result.json || !result.filename) {
        toast.error(result.error ?? "Could not prepare your export.");
        return;
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export has downloaded.");
    });
  }

  function handleErase(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startEraseTransition(async () => {
      const result = await anonymizeMyAccountAction({
        confirmationText,
        currentPassword: currentPassword || undefined,
      });
      // On success this redirects (via signOut) and never resolves normally
      // with ok:true reaching here — mirrors signOutAllDevices's own shape.
      if (result && !result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download a real, complete-as-of-now JSON snapshot of your profile and every record this app
            attributes to your account — CRM ownership, tasks, meetings, notifications, audit/security history,
            documents, comments, and more. Secrets (password hash, 2FA secret, API keys) are never included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Preparing export..." : "Download my data (JSON)"}
          </Button>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Delete / erase my account</CardTitle>
          <CardDescription>
            Permanently anonymizes your profile — name, email, phone, and every other personal detail are
            replaced or wiped, your password and 2FA are cleared, and you&apos;re signed out of every device.
            Records you own or created in your organization (deals, projects, invoices, and similar) are
            <strong className="text-foreground"> not</strong> deleted, since other people in your organization
            depend on them — they stay attached to your (now-anonymized) account id. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <ShieldAlert className="size-4" />
                Delete my account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Permanently erase your account?</DialogTitle>
                <DialogDescription>
                  This anonymizes your personal data and cannot be undone. Type{" "}
                  <strong className="text-foreground">{CONFIRMATION_PHRASE}</strong> to confirm.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleErase} className="flex flex-col gap-4">
                {hasPassword && (
                  <FormField label="Current password" htmlFor="eraseCurrentPassword" required>
                    <Input
                      id="eraseCurrentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </FormField>
                )}
                <FormField label={`Type "${CONFIRMATION_PHRASE}"`} htmlFor="eraseConfirmation" required>
                  <Input
                    id="eraseConfirmation"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </FormField>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Couldn&apos;t erase your account</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={erasing}>
                    Never mind
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={erasing || confirmationText.trim() !== CONFIRMATION_PHRASE}
                  >
                    {erasing ? "Erasing..." : "Permanently erase my account"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
