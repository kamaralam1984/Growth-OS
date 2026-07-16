import { z, type ZodType } from "zod";

import type { ProviderStructuredRequest, ProviderStructuredResponse, ProviderTextResponse } from "./types";

/**
 * None of the free-tier fallback providers (Groq, Gemini, OpenRouter) get
 * Anthropic's native `output_config.format` schema-enforced structured
 * output — instead every one of them shares this pattern: ask for JSON via
 * the provider's own JSON mode, embed the real Zod schema (converted with
 * Zod 4's built-in `z.toJSONSchema`) as an explicit instruction, validate the
 * response with the same Zod schema the caller passed in, and — since a
 * cheaper/free model is more likely to slip up on strict formatting — give it
 * exactly one real repair round-trip (send back its own invalid output plus
 * the real validation error) before giving up and letting the fallback chain
 * move to the next provider.
 */

function schemaInstruction<T>(schema: ZodType<T>): string {
  const jsonSchema = z.toJSONSchema(schema);
  return [
    "Respond with ONLY a single JSON object — no markdown code fences, no commentary before or after.",
    "The JSON object must strictly match this JSON Schema:",
    JSON.stringify(jsonSchema),
  ].join("\n");
}

function tryParse<T>(text: string, schema: ZodType<T>): { success: true; data: T } | { success: false; error: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (error) {
    return { success: false, error: `Response was not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = schema.safeParse(json);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.message };
}

/**
 * `callRaw` is the adapter's own plain-text call (system + user in, text +
 * usage out) — every JSON-mode-based adapter supplies its own since the
 * actual HTTP request shape differs per provider.
 */
export async function generateStructuredViaJsonMode<T>(
  providerId: string,
  callRaw: (system: string, userContent: string) => Promise<ProviderTextResponse>,
  req: ProviderStructuredRequest<T>,
): Promise<ProviderStructuredResponse<T>> {
  const system = `${req.system}\n\n${schemaInstruction(req.schema)}`;

  const first = await callRaw(system, req.userContent);
  const attempt1 = tryParse(first.text, req.schema);
  if (attempt1.success) {
    return { text: first.text, inputTokens: first.inputTokens, outputTokens: first.outputTokens, parsed: attempt1.data };
  }

  const repairUser = [
    `Your previous response did not validate against the required JSON Schema.`,
    `Your previous response was:\n${first.text}`,
    `Validation error:\n${attempt1.error}`,
    `Respond again with ONLY the corrected JSON object.`,
  ].join("\n\n");

  const second = await callRaw(system, repairUser);
  const attempt2 = tryParse(second.text, req.schema);
  if (attempt2.success) {
    return {
      text: second.text,
      inputTokens: first.inputTokens + second.inputTokens,
      outputTokens: first.outputTokens + second.outputTokens,
      parsed: attempt2.data,
    };
  }

  throw new Error(`[${providerId}] structured output failed validation after one repair attempt: ${attempt2.error}`);
}
