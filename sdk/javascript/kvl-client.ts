/**
 * KVL GrowthOS — JavaScript / TypeScript API client.
 *
 * This is a real, hand-written client covering the platform's actual public
 * API surface: exactly 4 endpoints (workflow triggering + CSV/CRM/Excel/PDF
 * export of companies, deals, and contacts). It is NOT yet published to npm —
 * copy this file directly into your project to use it today.
 *
 * Auth: pass the raw API key you generated at
 * /dashboard/settings/api-manager. Every request sends it as
 * `Authorization: Bearer <apiKey>`.
 *
 * Requires only the built-in `fetch` API — works in Node.js 18+ and in the
 * browser. No dependencies.
 */

export type ExportFormat = "csv" | "crm" | "excel" | "pdf";

export interface KVLClientOptions {
  /** Your raw API key, generated at /dashboard/settings/api-manager. */
  apiKey: string;
  /** Defaults to the production KVL GrowthOS API. */
  baseUrl?: string;
}

export interface TriggerWorkflowResponse {
  runId: string;
}

/**
 * Thrown for any non-2xx response. `status` is the HTTP status code and
 * `message` is the real `{ "error": "..." }` message returned by the API
 * (e.g. "Invalid or missing API key.", "This API key does not have the
 * 'export:companies:read' scope.", "Rate limit exceeded.").
 */
export class KVLApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "KVLApiError";
    this.status = status;
  }
}

export class KVLClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: KVLClientOptions) {
    if (!options?.apiKey) {
      throw new Error("KVLClient requires an `apiKey`.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://growthos.kvlbusinesssolutions.com").replace(/\/+$/, "");
  }

  /**
   * POST /api/v1/workflows/{workflowId}/trigger
   * Requires the `workflows:trigger` scope. Triggers a workflow run and
   * returns the new run's id. The workflow must be ACTIVE and belong to your
   * organization.
   */
  async triggerWorkflow(workflowId: string): Promise<TriggerWorkflowResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/trigger`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    return this.parseJsonOrThrow<TriggerWorkflowResponse>(response);
  }

  /**
   * GET /api/export/companies?format=csv|crm|excel|pdf
   * Requires the `export:companies:read` scope. Returns the raw `Response`
   * so callers can stream/save the file in whatever way suits their runtime
   * (`.text()` for csv/crm, `.arrayBuffer()` / `.blob()` for excel/pdf).
   */
  async exportCompanies(format: ExportFormat = "csv"): Promise<Response> {
    return this.getExport("/api/export/companies", format);
  }

  /**
   * GET /api/export/deals?format=csv|crm|excel|pdf
   * Requires the `export:deals:read` scope.
   */
  async exportDeals(format: ExportFormat = "csv"): Promise<Response> {
    return this.getExport("/api/export/deals", format);
  }

  /**
   * GET /api/export/contacts?format=csv|crm|excel|pdf
   * Requires the `export:contacts:read` scope.
   */
  async exportContacts(format: ExportFormat = "csv"): Promise<Response> {
    return this.getExport("/api/export/contacts", format);
  }

  private async getExport(path: string, format: ExportFormat): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("format", format);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response;
  }

  private async parseJsonOrThrow<T>(response: Response): Promise<T> {
    if (!response.ok) {
      await this.throwApiError(response);
    }
    return (await response.json()) as T;
  }

  private async throwApiError(response: Response): Promise<never> {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Response body wasn't JSON (or was empty) — fall back to the
      // generic message above.
    }
    throw new KVLApiError(response.status, message);
  }
}
