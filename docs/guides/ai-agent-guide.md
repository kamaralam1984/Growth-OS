# KVL GrowthOS — AI Agent Guide

> A real inventory of every AI agent type, its persona, and which board(s) it participates in — sourced from `src/lib/ai/personas.ts` and the orchestrators that consume it.

## 1. The single source of truth — `src/lib/ai/personas.ts`

`ExecutiveAgentType` is the one union every agent-runtime function (`runAgentTurn`/`runAgentVote`/`runMeetingAgentTurn`/`runReviewAgentTurn`, and their siblings — see §6) is typed against. It currently has 20 values, each with a real, specific `title`/`responsibilities[]`/`systemPrompt` in `PERSONAS` — no generic/boilerplate prompts. `getPersona(type)` is the one function that resolves a persona; `getAllPersonas()`, `getReviewBoardPersonas()`, and `getDeliveryBoardPersonas()` are the other exported accessors; nothing else hardcodes agent copy.

### Core executive agents (auto-provisioned at onboarding, 7 of the 13)
`CEO`, `SALES`, `MARKETING`, `PROPOSAL`, `OUTREACH`, `CRM`, `ANALYTICS`

### Core agents provisioned lazily (6 of the 13, real `upsert` on first real use, not at onboarding)
`FINANCE`, `LEGAL` — via `ensureReviewBoardAgentsProvisioned()` in `review-orchestrator.ts`, called the first time a Proposal Review Board is scheduled.
`PROJECT_MANAGER` — via `ensureProjectManagerAgentProvisioned()` in `project-manager-orchestrator.ts`, called at project-creation/planning time.
`QA_DIRECTOR`, `DEVOPS_DIRECTOR`, `DELIVERY_DIRECTOR` — via `ensureDeliveryBoardAgentsProvisioned()` in `delivery-board-orchestrator.ts`, called when a project's own Delivery Board first starts.

### Marketplace-installable agents (opt-in, never auto-provisioned)
`HR`, `SUPPORT`, `RECRUITMENT`, `SEO`, `BUSINESS_ANALYST`, `RESEARCH`, `CUSTOMER_SUCCESS` — each installs as a real `AIAgentInstance` via the `AGENT_PACK` marketplace category (see the Marketplace Guide). Each is a real persona layer over an already-existing engine rather than a duplicate implementation:

| Agent | Wraps |
|---|---|
| HR | `src/lib/hr/{hiring,leave,onboarding}.ts` — real `JobOpening`/`Candidate`/`Interview`/`LeaveRequest`; provisions new-hire onboarding as real `Task` rows the moment a candidate is marked HIRED |
| Support | `src/lib/support/tickets.ts` — the existing `Task`(`type: SUPPORT`) + `Comment` system, not a parallel ticket model; FAQ answers are grounded strictly in published Knowledge Base articles |
| Recruitment | `src/lib/recruitment/resume-analysis.ts` — deterministic keyword-overlap `matchScore` + AI skill extraction with honest confidence scores, kept structurally separate from the downstream HR pipeline |
| SEO | `src/lib/seo/agent.ts` — a persona layer over the existing, deterministic Website Scanner (`runWebsiteScan`): narrates real `SEOAudit` findings rather than re-running its own inspection, plus new live-web-search keyword research |
| Business Analyst | `src/lib/ai/business-analyst-agent.ts` — a persona layer over the AI Business Growth Engine's Growth Score / revenue forecast / pipeline health; narrates real numbers, never computes its own |
| Research | `src/lib/ai/research-agent.ts` — an ad-hoc, on-demand version of `discoverMarketTrends()`, same real two-pass web-search-then-extract discipline |
| Customer Success | `src/lib/ai/customer-success-agent.ts` — a persona layer over the Client Health/Churn/Upsell/Referral engines, persisted via the existing `ExecutiveBriefing` model (`type: CUSTOMER_SUCCESS`) |

### All 20 titles and real responsibilities (verbatim from `PERSONAS`)

| Type | Title | Responsibilities |
|---|---|---|
| CEO | CEO Agent | Business strategy, Task assignment, Decision making, Meeting management, Goal tracking, Performance review, Priority planning |
| SALES | Sales Agent | Lead qualification, CRM updates, Sales pipeline, Follow-up strategy, Meeting suggestions, Revenue tracking |
| MARKETING | Marketing Agent | Marketing ideas, Campaign planning, Content suggestions, LinkedIn strategy, SEO ideas, Growth opportunities |
| PROPOSAL | Proposal Agent | Proposal writing, Quotation generation, NDA drafting, Scope creation, Cost estimation, Timeline creation |
| OUTREACH | Outreach Agent | Cold email drafting, LinkedIn message drafting, Follow-up planning, Prospect research, Communication suggestions |
| CRM | CRM Agent | Client relationship history, Renewal risk, Account health, Data hygiene, Relationship continuity |
| ANALYTICS | Analytics Agent | Revenue prediction, Win-rate patterns, Forecasting, Benchmarking, Trend detection |
| FINANCE | Finance Agent | Profitability analysis, Margin calculation, Cost estimation, Discount impact, Payment risk |
| LEGAL | Legal Agent | Contract review, Missing clause detection, NDA/liability/warranty risk, Compliance checking |
| PROJECT_MANAGER | Project Manager Agent | Daily planning, Task assignment, Deadline monitoring, Risk detection, Progress reports, Meeting preparation, Resource recommendations, Quality monitoring |
| QA_DIRECTOR | QA Director Agent | Testing status, Bug analysis, Regression review, Quality score, Acceptance readiness, Release approval |
| DEVOPS_DIRECTOR | DevOps Director Agent | Deployment status, CI/CD, Infrastructure, Server health, Rollback planning, Performance, Security |
| DELIVERY_DIRECTOR | Delivery Director Agent | Milestones, Client deliverables, Delivery readiness, Go-live planning, Customer satisfaction, Release schedule |
| HR | HR Agent | Hiring pipeline, Candidate screening, Interview scheduling, Employee onboarding, Leave management |
| SUPPORT | Support Agent | Ticket management, FAQ responses, SLA monitoring, Customer issue routing, Escalation handling |
| RECRUITMENT | Recruitment Agent | Job description generation, Candidate sourcing, Resume analysis, Skill matching, Interview recommendations |
| SEO | SEO Agent | Website SEO audit, Keyword research, Content optimization, Technical SEO, Competitor SEO analysis |
| BUSINESS_ANALYST | Business Analyst Agent | KPI analysis, Revenue insights, Market opportunity analysis, Business reports, Executive recommendations |
| RESEARCH | Research Agent | Company research, Industry research, Competitor intelligence, Market trends, Technology analysis |
| CUSTOMER_SUCCESS | Customer Success Agent | Client health score, Renewal tracking, Churn prediction, Upsell recommendations, Customer engagement |

## 2. Which board an agent can speak on

Three separate, intentionally-scoped participant lists — widening `ExecutiveAgentType` does **not** widen any of these:

- **`EXECUTIVE_AGENT_TYPES`** (5: CEO, SALES, MARKETING, PROPOSAL, OUTREACH) — the AI Executive Board / War Room (`/board`). The 7 marketplace agents deliberately do not participate here; they have real personas and can genuinely speak via the agent-runtime functions, but the War Room stays a fixed 5-seat room.
- **`REVIEW_BOARD_AGENT_TYPES`** (8: CEO, SALES, MARKETING, PROPOSAL, FINANCE, LEGAL, CRM, ANALYTICS) — the AI Proposal Review Board, used by `src/lib/ai/review-orchestrator.ts` only.
- **`DELIVERY_BOARD_AGENT_TYPES`** (5: PROJECT_MANAGER, QA_DIRECTOR, DEVOPS_DIRECTOR, DELIVERY_DIRECTOR, CEO) — one board per project, used by `src/lib/ai/delivery-board-orchestrator.ts` only.

### AI Proposal Review Board — real mechanics (`review-orchestrator.ts`, 599 lines)

`scheduleBoardReview({organizationId, docKind, docId, requestedByUserId})` creates a `Meeting` (`status: "SCHEDULED"`) plus a `BoardReview` anchor row — covers `PROPOSAL`/`QUOTATION`/`CONTRACT`/`INVOICE` document kinds only (`DOC_KIND_DECISION_CATEGORY` map). `runReviewRound(boardReviewId)` flips the meeting `LIVE` on its first call and notifies/emails owners, then runs a **fixed speaking order** — `REVIEW_SPEAKING_ORDER = ["PROPOSAL","SALES","MARKETING","CRM","ANALYTICS","FINANCE","LEGAL","CEO"]` (specialists first, CEO closes) — with each agent's turn calling `runReviewAgentTurn` (FINANCE/LEGAL turns additionally pass a `specialty`), writing a `MeetingMessage` (`type: "DISCUSSION"`) whose `reviewJson` holds the full structured turn output; FINANCE and LEGAL additionally upsert `ProfitAnalysis`/`RiskAnalysis` rows keyed by `boardReviewId`. Context accumulates as a running transcript string passed forward to the next agent.

`runReviewVote(boardReviewId)` runs every active review-board `AIAgentInstance`'s vote in parallel (schema restricted to `APPROVE`/`APPROVE_WITH_CHANGES`/`REQUEST_REVISION`/`REJECT`), upserts `DecisionVote` rows, and tallies via `tallyReviewVotes` — a plain majority per outcome, with ties resolved **toward more scrutiny** (`REJECTED > NEEDS_REVISION > APPROVED_WITH_CHANGES > APPROVED`). It updates `Decision.status` and `BoardReview.finalDecision`/`overallConfidence`/`winProbability` (averaged from the discussion round's already-produced structured output — no extra LLM call for this), flattens every agent's `recommendations[]` into real `Recommendation` rows, fires any bound automation/workflow triggers, and notifies+emails owners.

### AI Delivery Board — real mechanics (`delivery-board-orchestrator.ts`, 383 lines)

One board per project (`Meeting.relatedProjectId`), roster PROJECT_MANAGER → {QA_DIRECTOR, DEVOPS_DIRECTOR, DELIVERY_DIRECTOR} (unordered middle) → CEO. `runDeliveryBoardRound(meetingId)` builds context from `buildProjectContext(projectId)` (shared with the PM orchestrator) plus a delivery-specific block — real counts of open BUG-type tasks, security-labeled bugs, `BugReport` rows, Go-Live milestone status, and open client tickets. Each turn is `runMeetingAgentTurn` (the same function the War Room uses, with a different `meetingLabel`), writing `MeetingMessage` rows carrying `priority`/`confidenceScore`/`suggestedAction`/`evidence`, and flattening `suggestedAction`s into `Recommendation` rows (`type: "DELIVERY_RECOMMENDATION"`). `runDeliveryBoardDecisionVote(decisionId)` runs parallel votes on a 7-choice schema (adds `ESCALATE`) and tallies to a `DecisionStatus`: `ESCALATED` if any `ESCALATE` vote wins outright priority, else majority `APPROVE`/`REJECT`, else `DELAYED` if `DELAY`/`REQUEST_REVISION` votes are present, else `DELEGATED`.

Real routes: `/board`, `/board/meetings` (+ `[id]`), `/board/reviews` (+ `[id]`), `/board/growth`, `/board/brief` (+ `[id]`), `/board/strategy` (+ `[id]`), `/board/intelligence`, `/board/tasks`, `/board/reports`, `/board/action-items`, `/board/activity`, `/board/chat`. Delivery Board is per-project at `src/app/dashboard/projects/[id]/delivery/` — distinct from that project's plain kanban at `.../[id]/board/`.

## 3. Provisioning

- **Onboarding** (`completeOnboarding()`, `src/app/onboarding/agents-actions.ts`) provisions exactly **7** `AGENT_DEFINITIONS` types — `CEO, SALES, MARKETING, PROPOSAL, OUTREACH, CRM, ANALYTICS` — never the 6 lazily-provisioned core/delivery types and never the 7 marketplace agents. It's idempotent by checking whether every `AGENT_DEFINITIONS` type already exists for the org (not a strict row count), specifically so later flows can lazily add more agent types without re-triggering onboarding logic. The same function also creates the org's `Workspace`, `KnowledgeBase`, 6 `PipelineStage` rows, and 10 `DealStage` rows, marks `User.onboardingCompletedAt`, and best-effort enqueues a `CompanyDiscoveryRun` if the org supplied a website.
- **Marketplace install** (`installAgentPack()`, `src/lib/marketplace/installers/agent-pack.ts`) is the only other path that creates an `AIAgentInstance` for a marketplace-only type — a real `upsert` keyed on `organizationId_type` (backing `@@unique([organizationId, type])`), so re-installing after an uninstall reactivates the same row rather than duplicating it:

  ```ts
  const agent = await prisma.aIAgentInstance.upsert({
    where: { organizationId_type: { organizationId, type: manifest.agentType } },
    create: { organizationId, type: manifest.agentType, name: persona.title, active: true,
      introMessage: `I'm your ${persona.title.replace(" Agent", "")} — ${persona.responsibilities.slice(0, 3).join(", ").toLowerCase()}.` },
    update: { active: true },
  });
  ```

  Uninstall flips `active: false`, never deletes (preserves Task/Decision/Meeting history FKs) — the same convention every lazy-provisioning path above follows.

7 (onboarding) + 2 (review-lazy) + 1 (PM-lazy) + 3 (delivery-lazy) = 13, matching every non-marketplace `ExecutiveAgentType`. The remaining 7 marketplace types are never auto-provisioned by any of the above.

## 4. AI Memory & tools

Every agent has real `AgentMemory` (AES-256-GCM encrypted via `src/lib/ai/encryption.ts`, keyed by `AGENT_MEMORY_ENCRYPTION_KEY` — see the Security Guide's encryption-key table), org-scoped, never shared across tenants. Every mutation (create/edit/pin/archive/delete) is separately audited via `logMemoryEvent()` (`src/lib/ai/memory-events.ts`), writing `AgentMemoryEvent` rows.

Tool access is scoped by the ABAC layer (`src/lib/security/abac.ts`, `canAccessResource()`) — a small, honestly-bounded policy layer on top of RBAC, not a replacement for it. It enforces exactly two hard rules: (1) tenant isolation — a resource whose `organizationId` differs from the caller's context is always denied, and (2) `VIEWER` membership can never `write`/`delete` regardless of resource ownership. Every deny fires a fire-and-forget `PERMISSION_DENIED` `SecurityEvent`. The file's own doc comment is explicit that it's wired into only a small number of concrete call sites today (`src/app/dashboard/settings/secrets/actions.ts`, `src/app/company/actions.ts`) — not every Server Action in the app — so an agent never has broader read/write access than the membership role that would grant it to a human user in the same seat, at the places this layer is actually applied.

## 5. What a single agent turn actually is — `runAgentTurn` (`src/lib/ai/agent-runtime.ts`, 975 lines)

No tool-calling loop — a plain single-shot text generation, in order:

1. Throws `AINotConnectedError` if `!isAIConnected()`.
2. Resolves the real system prompt via `getPersona(agentType)`.
3. `setAgentStatus(agentId, "THINKING", task)` — updates `AIAgentInstance.status` and publishes a realtime `agent_status` event (drives the Live AI Panel in the UI).
4. `loadAgentMemoryContext(agentId, limit=8)` — reads up to 8 non-archived `AgentMemory` rows ordered `[{pinned:"desc"},{updatedAt:"desc"}]`, decrypts each, and formats them as `- [TYPE](pinned) content` lines. No semantic/vector ranking here — naive pin-then-recency.
5. An optional Context Engine hook: if an `organizationId` is given, calls `buildAgentContext(organizationId, {agentId, clientQuery})` from `@/lib/context-engine` (errors are swallowed).
6. Builds the final prompt — `system = persona.systemPrompt + agent name`; `userContent` = memory context + engine context + prior conversation + `"Your task now: ${task}"`, blank sections filtered out.
7. Calls `generateText({system, userContent, maxTokens: 2048, effort}, {organizationId, agentId, context: "agent-turn"})` — this is the **one** call site in the whole codebase that queues a durable BullMQ retry (`enqueueAIFallbackRetry`, queue `kvl-ai-fallback`) on total provider-chain failure.
8. On success: `setAgentStatus(..., "COMPLETED")` and `recordAgentAIUsage(...)` (a real token-usage billing record); on error: resets status to `"IDLE"` and rethrows.

Sibling turn functions in the same file, all following the same status → memory → generate → usage-record shape: `runAgentVote`, `runDeliveryVoteTurn`, `runMeetingAgentTurn`, `runMeetingNotesTurn`, `runReviewAgentTurn` (three overloads keyed by `specialty: "FINANCE"|"LEGAL"|undefined`), `runReviewVoteTurn`, `runProjectManagerTurn`, `runWebSearchDiscovery`, `runCompanyIntelligenceTurn`, `runResearchNoteTurn`. Tool use exists only via Anthropic's server-side `web_search_20250305` tool inside the research/discovery-flavored turns above — never inside plain `runAgentTurn`.

Other real files under `src/lib/ai/` worth knowing about: `document-engine.ts` (AI generation for proposal sections, contract content, business documents), `executive-briefing.ts` (`generateDailyBrief()` — the AI CEO Daily Brief), `insights-generator.ts` (`generateExecutiveInsights()` — writes `Insight` rows: `TOP_OPPORTUNITY`, `HIGHEST_PRIORITY`, `RISK_ALERT`, `GROWTH_SUGGESTION`, `SALES_SUGGESTION`, `MARKETING_SUGGESTION`, `PRODUCTIVITY_SUGGESTION`), `task-engine.ts` (`generateTaskSuggestions()` — grounded strictly in real open `Task` rows, never invents a task id), `meeting-lifecycle.ts` (headless/scheduler-triggered meeting starters, tagged `triggeredBy: "scheduler"`, standing in the longest-tenured OWNER since there's no session), and `status.ts` (`getAIConnectionStatus()` — `"connected" | "no_credits" | "not_connected"`, determined by a real 1-token ping through the fallback chain, cached 30s in-process).

## 6. Fallback chain — `src/lib/ai/fallback.ts`

Every real AI call in this app (all 20 personas, every engine above) goes through one shared provider cascade:

```ts
const PROVIDER_CHAIN: AIProviderAdapter[] = [anthropicProvider, groqProvider, geminiProvider, openrouterProvider];
```

Real model IDs used per provider (`src/lib/ai/client.ts` and `src/lib/ai/providers/*.ts`):

| Provider | Model |
|---|---|
| Anthropic | `AGENT_MODEL = "claude-opus-4-8"` — "the one model this app is allowed to use for agent reasoning" |
| Groq | `process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"` |
| Gemini | `process.env.GEMINI_MODEL ?? "gemini-2.5-flash"` |
| OpenRouter | `process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free"` |

Paid Anthropic is tried first, then Groq, Gemini, and OpenRouter free tiers in order, with a per-process circuit breaker (`const lastFailureAt = new Map<string, number>()`, `COOLDOWN_MS = 60_000`) so a failed provider is skipped for 60s rather than retried on every call — purely in-memory, documented as resetting on every deploy/restart, "never a source of truth for whether a provider is actually configured or down." Anthropic's adapter is the only one with real `web_search_20250305` server-tool support; the others silently ignore the `webSearch` flag (Gemini's prompt explicitly tells the model live search is unavailable). Non-Anthropic structured output goes through a shared JSON-mode-plus-repair path (`providers/json-mode.ts`), not each provider's own native schema mechanism.

With zero providers configured, `generateText`/`generateStructured` throw `AllAIProvidersFailedError` and every AI-gated feature honestly reports "not connected" — never a fabricated response.

**Env vars** (`.env.example`, all optional — these are the platform's own fallback keys shared by every org's agents, distinct from each organization's own bring-your-own-key Integration Hub credentials under `/dashboard/settings/integrations`):

```
# ANTHROPIC_API_KEY=
# GROQ_API_KEY=
# GROQ_MODEL="llama-3.3-70b-versatile"
# GEMINI_API_KEY=
# GEMINI_MODEL="gemini-2.5-flash"
# OPENROUTER_API_KEY=
# OPENROUTER_MODEL="meta-llama/llama-3.3-70b-instruct:free"
```

`AGENT_MEMORY_ENCRYPTION_KEY` (64-char hex / 32-byte AES-256-GCM key) is required once any agent persists memory — its own sibling key, independent of `INTEGRATION_TOKEN_ENCRYPTION_KEY`/`SECRETS_MANAGER_ENCRYPTION_KEY`. `REDIS_URL` is required for the fallback retry queue (`fallback-queue.ts`, 5 attempts, exponential backoff starting at 60s) as well as the Scheduler Service.
