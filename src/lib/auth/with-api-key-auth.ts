import { recordAPIUsage } from "@/lib/api-usage";
import { checkApiKeyRateLimit, hasApiKeyScope, verifyApiKeyAuth, type ApiKeyAuthResult } from "@/lib/auth/api-key";
import type { ApiKeyScope } from "@/lib/auth/api-key-scopes";
import { logSecurityEvent } from "@/lib/security/security-events";

/**
 * Wraps an external-facing API route handler with real bearer-`ApiKey`
 * authentication: verifies the key, enforces the given scope and the key's
 * own `rateLimitPerHour`, and records every call (auth failures included) to
 * `APIUsage` via recordAPIUsage. Mirrors this repo's existing route response
 * shapes (`{ error: string }` JSON bodies, matching status codes).
 */
export function withApiKeyAuth(
  requiredScope: ApiKeyScope,
  handler: (request: Request, auth: ApiKeyAuthResult) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const endpoint = new URL(request.url).pathname;

    const auth = await verifyApiKeyAuth(request);
    if (!auth) {
      return Response.json({ error: "Invalid or missing API key." }, { status: 401 });
    }

    if (!hasApiKeyScope(auth, requiredScope)) {
      void recordAPIUsage({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        endpoint,
        method: request.method,
        statusCode: 403,
        responseTimeMs: 0,
      });
      void logSecurityEvent({
        organizationId: auth.organizationId,
        type: "API_KEY_ABUSE",
        severity: "WARNING",
        detail: `missing scope '${requiredScope}' on ${request.method} ${endpoint}`,
        metadata: { apiKeyId: auth.apiKeyId, endpoint, method: request.method, requiredScope, reason: "missing_scope" },
      });
      return Response.json(
        { error: `This API key does not have the '${requiredScope}' scope.` },
        { status: 403 },
      );
    }

    const rateLimit = await checkApiKeyRateLimit(auth);
    if (!rateLimit.allowed) {
      void recordAPIUsage({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        endpoint,
        method: request.method,
        statusCode: 429,
        responseTimeMs: 0,
      });
      void logSecurityEvent({
        organizationId: auth.organizationId,
        type: "API_KEY_ABUSE",
        severity: "WARNING",
        detail: `rate limit exceeded on ${request.method} ${endpoint}`,
        metadata: { apiKeyId: auth.apiKeyId, endpoint, method: request.method, reason: "rate_limit_exceeded" },
      });
      return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    const start = Date.now();
    let statusCode = 500;
    try {
      const response = await handler(request, auth);
      statusCode = response.status;
      return response;
    } catch (error) {
      statusCode = 500;
      throw error;
    } finally {
      void recordAPIUsage({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        endpoint,
        method: request.method,
        statusCode,
        responseTimeMs: Date.now() - start,
      });
    }
  };
}
