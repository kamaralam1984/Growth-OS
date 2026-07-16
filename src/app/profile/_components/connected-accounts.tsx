"use client";

import { signIn } from "next-auth/react";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ConnectedAccountsProps {
  accounts: { id: string; provider: string }[];
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  "microsoft-entra-id": "Microsoft",
  github: "GitHub",
};

const CONNECT_OPTIONS = [
  { provider: "google", label: "Google" },
  { provider: "microsoft-entra-id", label: "Microsoft" },
  { provider: "github", label: "GitHub" },
] as const;

export function ConnectedAccounts({ accounts }: ConnectedAccountsProps) {
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
            No connected accounts yet. Connect Google, Microsoft, or GitHub for one-click sign-in.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {CONNECT_OPTIONS.filter((option) => !connectedProviders.has(option.provider)).map((option) => (
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
