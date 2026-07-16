import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Telegram — API_KEY auth using a Bot API token issued by @BotFather. No
 * platform-level env var is required — any org supplies its own bot token.
 *
 * Quirk: the token is embedded directly in the URL path
 * (`/bot{token}/getMe`), not sent as a header, per Telegram's Bot API
 * design. Telegram can also return HTTP 200 with `{ok:false, description}`
 * on some error cases, so the JSON `ok` field must be checked explicitly.
 */

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: TelegramUser;
}

async function getMe(botToken: string): Promise<{ response: Response; body: TelegramResponse }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const body = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse;
  return { response, body };
}

export const telegramAdapter: IntegrationAdapter = {
  key: "TELEGRAM",
  name: "Telegram",
  category: "COMMUNICATION",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own bot token
  },

  credentialFields: [{ key: "botToken", label: "Bot Token", placeholder: "123456:ABC-...", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const botToken = credentials.botToken?.trim();
    if (!botToken) throw new Error("A Telegram bot token is required.");

    const { response, body } = await getMe(botToken);
    if (!response.ok || !body.ok || !body.result) {
      throw new Error(`Telegram rejected this bot token: ${body.description ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: botToken,
      scopes: [],
      metadata: { botUserId: body.result.id, botUsername: body.result.username ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const { response, body } = await getMe(accessToken);
    if (!response.ok || !body.ok || !body.result) {
      return { ok: false, detail: `Telegram getMe failed: ${body.description ?? `HTTP ${response.status}`}` };
    }
    return { ok: true, detail: body.result.username };
  },

  async revoke(): Promise<void> {
    // Telegram's Bot API has no remote-revoke call — regenerating the token
    // must be done via @BotFather. Disconnecting here only removes our
    // local copy.
  },
};
