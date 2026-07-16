import { createOpenAICompatibleProvider } from "./openai-compatible";

/**
 * Third tier in the fallback chain (after Anthropic, Groq) and second free
 * tier — OpenRouter aggregates many providers' hosted models; the `:free`
 * suffix model below is a genuinely zero-cost route, used only once both the
 * paid provider and the faster free provider (Groq) have already failed.
 * Model is env-overridable (`OPENROUTER_MODEL`) since OpenRouter regularly
 * rotates which specific model backs a given `:free` slug.
 */
export const openrouterProvider = createOpenAICompatibleProvider({
  id: "OPENROUTER",
  model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnvVar: "OPENROUTER_API_KEY",
  extraHeaders: {
    "HTTP-Referer": process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3040",
    "X-Title": "KVL GrowthOS",
  },
});
