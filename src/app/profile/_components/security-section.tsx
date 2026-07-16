import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorSection } from "./two-factor-section";
import { DeviceSessionsList, type DeviceSessionRow } from "./device-sessions-list";
import { SecurityEventsList, type SecurityEventRow } from "./security-events-list";

export interface SecuritySectionProps {
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  deviceSessions: DeviceSessionRow[];
  securityEvents: SecurityEventRow[];
}

export function SecuritySection({
  hasPassword,
  twoFactorEnabled,
  deviceSessions,
  securityEvents,
}: SecuritySectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            {hasPassword
              ? "Update the password used to sign in."
              : "Set a password for your account (you currently sign in via a connected account)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm hasPassword={hasPassword} />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>Secure your account with a time-based one-time code.</CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSection initialEnabled={twoFactorEnabled} />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Active sessions & devices</CardTitle>
          <CardDescription>Everywhere you&apos;re currently signed in, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeviceSessionsList deviceSessions={deviceSessions} />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Recent security events</CardTitle>
          <CardDescription>
            Sign-ins from both a new device and a network we haven&apos;t seen you use before — a stronger signal
            than an ordinary new-device alert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityEventsList events={securityEvents} />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Background jobs</CardTitle>
          <CardDescription>
            Owners and admins can review the Scheduler Service&apos;s recurring jobs — daily board meetings, health
            snapshots, audit log cleanup — with real execution history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/jobs" className="text-sm font-medium text-primary hover:underline">
            Open Job Management Dashboard →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect email, calendar, e-signature, CRM sync, communication, storage, payments, accounting, meetings,
            development, and AI provider accounts — real OAuth and API-key connections, never a simulated
            &quot;connected&quot; state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/integrations" className="text-sm font-medium text-primary hover:underline">
            Open Integration Management →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>API Manager</CardTitle>
          <CardDescription>
            Real per-key usage metrics, call volume over time, and the live API reference for every endpoint your
            organization&apos;s keys can call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/api-manager" className="text-sm font-medium text-primary hover:underline">
            Open API Manager →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Event history</CardTitle>
          <CardDescription>
            Every realtime event this organization has published — notifications, activity, agent status, portal
            comments — durably logged and replayable, not just whatever&apos;s currently connected over SSE.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/events" className="text-sm font-medium text-primary hover:underline">
            Open Event History →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Secrets Manager</CardTitle>
          <CardDescription>
            Store API keys, SMTP credentials, JWT secrets, and other third-party credentials your Workflows need —
            AES-256-GCM encrypted at rest, write-only from the UI, never displayed again after saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/secrets" className="text-sm font-medium text-primary hover:underline">
            Open Secrets Manager →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>White Label</CardTitle>
          <CardDescription>
            Custom branding, logo/favicon, colors, and custom domains — available on plans with white-label access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/white-label" className="text-sm font-medium text-primary hover:underline">
            Open White Label Settings →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            See which features your organization&apos;s plan includes and why — plan-driven, override-aware.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/feature-flags" className="text-sm font-medium text-primary hover:underline">
            Open Feature Flags →
          </Link>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Licenses</CardTitle>
          <CardDescription>
            Generate and manage real API/Seat/Enterprise license keys for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/licenses" className="text-sm font-medium text-primary hover:underline">
            Open License Management →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
