"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { GoogleIcon, MicrosoftIcon, GitHubIcon } from "@/components/icons/oauth-icons";
import type { EnabledOAuthProviders } from "@/lib/auth/oauth-providers";

/**
 * Renders only the buttons for providers actually configured server-side
 * (see getEnabledOAuthProviders / src/auth.ts's oauthProviders) — never a
 * button that would fail because the platform operator hasn't added real
 * OAuth credentials yet, matching this app's "don't show what isn't real"
 * policy everywhere else.
 */
export function OAuthButtons({
  providers,
  callbackUrl,
}: {
  providers: EnabledOAuthProviders;
  callbackUrl?: string | null;
}) {
  const hasAny = providers.google || providers.microsoftEntraId || providers.github;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {providers.google && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => signIn("google", { callbackUrl: callbackUrl ?? "/dashboard" })}
          >
            <GoogleIcon className="size-4" />
            Google
          </Button>
        )}
        {providers.microsoftEntraId && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: callbackUrl ?? "/dashboard" })}
          >
            <MicrosoftIcon className="size-4" />
            Microsoft
          </Button>
        )}
        {providers.github && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => signIn("github", { callbackUrl: callbackUrl ?? "/dashboard" })}
          >
            <GitHubIcon className="size-4" />
            GitHub
          </Button>
        )}
      </div>
    </div>
  );
}
