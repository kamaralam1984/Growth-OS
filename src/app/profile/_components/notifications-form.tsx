"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotificationPreferencesInput } from "@/lib/validations/profile";
import { updateNotificationPreferences } from "../actions";

export interface NotificationsFormProps {
  initial: NotificationPreferencesInput;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  badge?: string;
}

function ToggleRow({ label, description, checked, onChange, disabled, badge }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && <Badge variant="outline">{badge}</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-background shadow-card transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationsForm({ initial }: NotificationsFormProps) {
  const [form, setForm] = useState<NotificationPreferencesInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof NotificationPreferencesInput>(key: K, value: NotificationPreferencesInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateNotificationPreferences(form);
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
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose how you want to hear from your AI workforce.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ToggleRow
            label="Email"
            description="Important updates sent to your inbox."
            checked={form.emailNotifications}
            onChange={(v) => set("emailNotifications", v)}
          />
          <ToggleRow
            label="Browser"
            description="In-app and browser push notifications."
            checked={form.browserNotifications}
            onChange={(v) => set("browserNotifications", v)}
          />
          <ToggleRow
            label="Slack"
            description="Send notifications to a Slack channel via webhook."
            checked={form.slackNotifications}
            onChange={(v) => set("slackNotifications", v)}
          />
          {form.slackNotifications && (
            <FormField label="Slack webhook URL" htmlFor="slackWebhookUrl">
              <Input
                id="slackWebhookUrl"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={form.slackWebhookUrl ?? ""}
                onChange={(e) => set("slackWebhookUrl", e.target.value)}
              />
            </FormField>
          )}
          <ToggleRow
            label="Microsoft Teams"
            description="Send notifications to a Teams channel via webhook."
            checked={form.teamsNotifications}
            onChange={(v) => set("teamsNotifications", v)}
          />
          {form.teamsNotifications && (
            <FormField label="Teams webhook URL" htmlFor="teamsWebhookUrl">
              <Input
                id="teamsWebhookUrl"
                type="url"
                placeholder="https://outlook.office.com/webhook/..."
                value={form.teamsWebhookUrl ?? ""}
                onChange={(e) => set("teamsWebhookUrl", e.target.value)}
              />
            </FormField>
          )}
          <ToggleRow
            label="WhatsApp"
            description="Notifications via WhatsApp."
            checked={false}
            onChange={() => {}}
            disabled
            badge="Coming soon"
          />
          <ToggleRow
            label="Telegram"
            description="Notifications via Telegram."
            checked={false}
            onChange={() => {}}
            disabled
            badge="Coming soon"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
