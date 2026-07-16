import type { ApiKeyScope } from "@/lib/auth/api-key-scopes";

export interface ApiDocEntry {
  method: string;
  path: string;
  scope: ApiKeyScope;
  description: string;
  exampleResponse?: string;
}

/**
 * Hand-maintained, honest list of this app's actual API-key-gated
 * endpoints. Every entry below corresponds to a real route handler under
 * src/app/api/ that calls verifyApiKeyAuth (src/lib/auth/api-key.ts) and
 * accepts a `Authorization: Bearer <key>` request alongside the normal
 * session-cookie path. Do not add an entry here until the route itself is
 * actually wired up — grep `src/app/api/` for `verifyApiKeyAuth` (or its
 * `withApiKeyAuth` wrapper, once that lands) to find the current real set.
 */
export const API_DOCS: ApiDocEntry[] = [
  {
    method: "GET",
    path: "/api/export/companies",
    scope: "export:companies:read",
    description:
      "Bulk-export every Company record for the key's organization, with lead score band/overall score included, as CSV, CRM-mapped CSV, Excel, or PDF (?format=csv|crm|excel|pdf, default csv).",
    exampleResponse: `name,industry,website,email,phone,address,headquartersCity,headquartersState,headquartersCountry,employeeCount,estimatedRevenue,foundedYear,status,priority,source,leadScoreBand,leadScoreOverall,technologies,createdAt
Acme Corp,Software,https://acme.example,hello@acme.example,+1-555-0100,,San Francisco,CA,US,120,5000000,2015,ACTIVE,HIGH,MANUAL,WARM,72,"React,Node.js",2026-01-14T09:00:00.000Z`,
  },
  {
    method: "GET",
    path: "/api/export/deals",
    scope: "export:deals:read",
    description: "Bulk-export every Deal record for the key's organization as CSV, Excel, or PDF (?format=csv|excel|pdf, default csv).",
    exampleResponse: `Deal Name,Stage,Value,Probability,Priority,Owner,Company,Expected Close,Created At
Acme Corp — Platform rollout,Negotiation,45000,60,HIGH,Jane Doe,Acme Corp,2026-03-01,2026-01-14`,
  },
  {
    method: "GET",
    path: "/api/export/contacts",
    scope: "export:contacts:read",
    description: "Bulk-export every Contact record for the key's organization as CSV, Excel, or PDF (?format=csv|excel|pdf, default csv).",
    exampleResponse: `Name,Email,Job Title,Phone,Company,Status,Owner,Created At
Jane Doe,jane@acme.example,VP Engineering,+1-555-0100,Acme Corp,ACTIVE,Jane Doe,2026-01-14`,
  },
  {
    method: "POST",
    path: "/api/v1/workflows/{workflowId}/trigger",
    scope: "workflows:trigger",
    description:
      "Starts a real run of the given Workflow (must belong to the key's organization and have status ACTIVE), passing the JSON request body as the run's triggerPayload. Returns the new WorkflowRun id.",
    exampleResponse: `{"runId": "clx1a2b3c4d5e6f7g8h9i0j1"}`,
  },
];
