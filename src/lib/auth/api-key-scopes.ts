/**
 * Closed set of scope strings an `ApiKey` can be granted. Keep this list
 * honest: every entry maps to a real route already wired to
 * verifyApiKeyAuth, or a real internal capability another route is being
 * retrofitted onto — never a placeholder for something that doesn't exist.
 *
 * - export:companies:read — GET /api/export/companies (the first real
 *   verifyApiKeyAuth consumer; bulk Company export as CSV/Excel/PDF).
 * - export:deals:read — GET /api/export/deals (bulk Deal export; currently
 *   session-only, being retrofitted onto verifyApiKeyAuth).
 * - export:contacts:read — bulk Contact export, mirroring the Company/Deal
 *   export shape for the Contact model.
 * - workflows:trigger — programmatically fire a Workflow run via the real
 *   startWorkflowRun/fireWorkflowTrigger engine (src/lib/workflows/engine.ts,
 *   src/lib/workflows/triggers.ts).
 *
 * Extend this array (and DESCRIPTIONS below) as more routes adopt
 * verifyApiKeyAuth — no migration required, `scopes` is a plain String[].
 */
export const API_KEY_SCOPES = [
  "export:companies:read",
  "export:deals:read",
  "export:contacts:read",
  "workflows:trigger",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  "export:companies:read": "Export company records (CSV, Excel, PDF).",
  "export:deals:read": "Export deal/pipeline records (CSV, Excel, PDF).",
  "export:contacts:read": "Export contact records (CSV, Excel, PDF).",
  "workflows:trigger": "Trigger a workflow run programmatically.",
};

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}
