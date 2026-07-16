import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Discord — API_KEY auth using a static bot token from the Discord Developer
 * Portal (server-side bot integrations don't use a per-user OAuth redirect
 * to send messages; the bot token is a long-lived credential like Stripe's
 * secret key). No platform-level env var is required — any org supplies its
 * own bot token.
 *
 * Quirk: Discord's auth scheme is the literal `Bot <token>` prefix, not
 * `Bearer`.
 */

const API_BASE = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username?: string;
  discriminator?: string;
}

interface DiscordErrorBody {
  message?: string;
}

export const discordAdapter: IntegrationAdapter = {
  key: "DISCORD",
  name: "Discord",
  category: "COMMUNICATION",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own bot token
  },

  credentialFields: [{ key: "botToken", label: "Bot Token", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const botToken = credentials.botToken?.trim();
    if (!botToken) throw new Error("A Discord bot token is required.");

    const response = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    const body = (await response.json().catch(() => ({}))) as DiscordUser & DiscordErrorBody;
    if (!response.ok) {
      throw new Error(`Discord rejected this bot token: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: botToken,
      scopes: [],
      metadata: { botUserId: body.id, botUsername: body.username ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: `Bot ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as DiscordErrorBody;
      return { ok: false, detail: `Discord users/@me check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as DiscordUser;
    return { ok: true, detail: body.username };
  },

  async revoke(): Promise<void> {
    // Discord bot tokens have no remote-revoke API — regenerating the token
    // must be done from the Discord Developer Portal. Disconnecting here
    // only removes our local copy.
  },
};
