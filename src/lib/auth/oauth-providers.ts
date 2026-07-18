export interface EnabledOAuthProviders {
  google: boolean;
  microsoftEntraId: boolean;
  github: boolean;
}

/**
 * Single source of truth for "is this OAuth provider actually usable right
 * now" — both src/auth.ts (which provider to register with NextAuth) and
 * the login/register pages (which "Sign in with X" button to render) read
 * from this, so a provider's button can never appear without the backend
 * actually being able to complete that flow, or vice versa.
 */
export function getEnabledOAuthProviders(): EnabledOAuthProviders {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoftEntraId: Boolean(
      process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
    ),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}
