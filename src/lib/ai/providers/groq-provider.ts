import { createOpenAICompatibleProvider } from "./openai-compatible";

/**
 * First free-tier fallback in the chain — Groq's free tier is fast, has a
 * generous free request/token allowance, and (via `llama-3.3-70b-versatile`)
 * follows instructions well enough for this app's structured-output prompts.
 * Model is env-overridable (`GROQ_MODEL`) so ops can move to a newer hosted
 * model without a code change if Groq deprecates this one.
 */
export const groqProvider = createOpenAICompatibleProvider({
  id: "GROQ",
  model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnvVar: "GROQ_API_KEY",
});
