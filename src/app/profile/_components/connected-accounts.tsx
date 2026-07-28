"use client";

import { signIn } from "next-auth/react";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EnabledOAuthProviders } from "@/lib/auth/oauth-providers";

export interface ConnectedAccountsProps {
  accounts: { id: string; provider: string }[];
  oauthProviders: EnabledOAuthProviders;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  "microsoft-entra-id": "Microsoft",
  github: "GitHub",
  linkedin: "LinkedIn",
};

const CONNECT_OPTIONS = [
  { provider: "google", label: "Google", enabledKey: "google" },
  { provider: "microsoft-entra-id", label: "Microsoft", enabledKey: "microsoftEntraId" },
  { provider: "github", label: "GitHub", enabledKey: "github" },
  { provider: "linkedin", label: "LinkedIn", enabledKey: "linkedin" },
] as const satisfies readonly { provider: string; label: string; enabledKey: keyof EnabledOAuthProviders }[];

export function ConnectedAccounts({ accounts, oauthProviders }: ConnectedAccountsProps) {
  const connectedProviders = new Set(accounts.map((a) => a.provider));

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>Sign in faster by linking an account you already use.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {accounts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between rounded-xl border border-border p-4"
              >
                <span className="text-sm font-medium text-foreground">
                  {PROVIDER_LABELS[account.provider] ?? account.provider}
                </span>
                <Badge variant="accent">Connected</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No connected accounts yet. Connect Google, Microsoft, GitHub, or LinkedIn for one-click sign-in.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {CONNECT_OPTIONS.filter(
            (option) => !connectedProviders.has(option.provider) && oauthProviders[option.enabledKey],
          ).map((option) => (
            <Button
              key={option.provider}
              type="button"
              variant="outline"
              onClick={() => signIn(option.provider)}
            >
              <Link2 className="size-4" />
              Connect {option.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Connecting requires the relevant OAuth provider to be configured for this environment.
        </p>
      </CardContent>
    </Card>
  );
}
