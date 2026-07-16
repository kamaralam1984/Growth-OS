/**
 * Client-safe navigation command registry for the Cmd+K Command Palette and
 * the standalone AI Command Bar.
 *
 * Split out of src/lib/commands.ts (2026-07-14 fix): that module also
 * exports `runAICommand`, which imports `@/lib/prisma` (and transitively
 * `pg`, which needs Node's `dns` module) — fine for a Server Action, but
 * `command-palette.tsx` / `ai-command-bar.tsx` are both `"use client"` and
 * import `getNavigationCommands` directly from the same module, so the
 * bundler pulled the entire server-only module (Prisma included) into the
 * client bundle and broke every route that mounts <CommandPalette /> with a
 * "Module not found: Can't resolve 'dns'" build error. This file contains
 * only plain, deterministic data — no DB/AI imports — so it's safe to
 * import from either side.
 */

/**
 * A single entry in the command registry that powers both the Cmd+K
 * Command Palette and (for navigation items) any other quick-jump UI.
 *
 * Shape decision: a command is either a plain navigation (`href` — the UI
 * just does `router.push(href)` / renders a `<Link>`) or a client-only
 * `action` (currently just `"toggle-theme"`). It can't be a function here
 * because next-themes' `useTheme()` only works inside a Client Component —
 * so instead of a closure, `action` is a plain string discriminator the
 * Command Palette component switches on and wires to its own handler (e.g.
 * `if (cmd.action === "toggle-theme") setTheme(...)`). Exactly one of
 * `href` / `action` is set per command.
 */
export interface CommandDefinition {
  id: string;
  label: string;
  keywords: string[];
  group: "navigation" | "theme";
  href?: string;
  action?: "toggle-theme";
}

/**
 * Static, deterministic navigation commands — no DB/AI calls, safe to
 * compute at render time on either client or server.
 *
 * Route notes: "Go to Dashboard" points at `/dashboard`, the Command Center
 * page this phase introduces. Every other href is an existing Phase 2/3
 * route confirmed by reading src/app/board/_components/board-nav.tsx,
 * src/app/profile/page.tsx and src/app/company/page.tsx.
 */
export function getNavigationCommands(): CommandDefinition[] {
  return [
    {
      id: "nav.dashboard",
      label: "Go to Dashboard",
      keywords: ["dashboard", "home", "command center", "widgets"],
      group: "navigation",
      href: "/dashboard",
    },
    {
      id: "nav.board",
      label: "Go to AI Executive Board",
      keywords: ["board", "executive", "agents", "ai board"],
      group: "navigation",
      href: "/board",
    },
    {
      id: "nav.meetings",
      label: "Go to Meetings",
      keywords: ["meetings", "meeting", "calendar", "agenda"],
      group: "navigation",
      href: "/board/meetings",
    },
    {
      id: "nav.tasks",
      label: "Go to Tasks",
      keywords: ["tasks", "task", "todo", "to-do"],
      group: "navigation",
      href: "/board/tasks",
    },
    {
      id: "nav.chat",
      label: "Go to Chat",
      keywords: ["chat", "messages", "conversation", "agent chat"],
      group: "navigation",
      href: "/board/chat",
    },
    {
      id: "nav.activity",
      label: "Go to Activity",
      keywords: ["activity", "timeline", "feed", "log"],
      group: "navigation",
      href: "/board/activity",
    },
    {
      id: "nav.reports",
      label: "Go to Reports",
      keywords: ["reports", "report", "analytics"],
      group: "navigation",
      href: "/board/reports",
    },
    {
      id: "nav.profile",
      label: "Go to Profile",
      keywords: ["profile", "account", "settings", "me"],
      group: "navigation",
      href: "/profile",
    },
    {
      id: "nav.company",
      label: "Go to Company Profile",
      keywords: ["company", "organization", "org profile", "business profile"],
      group: "navigation",
      href: "/company",
    },
    {
      id: "nav.knowledgeBase",
      label: "Go to Knowledge Base",
      keywords: ["knowledge base", "wiki", "articles", "sop", "policies"],
      group: "navigation",
      href: "/dashboard/knowledge-base",
    },
    {
      id: "nav.knowledgeBaseDocuments",
      label: "Go to Knowledge Documents",
      keywords: ["documents", "ingestion", "upload", "pdf", "rag"],
      group: "navigation",
      href: "/dashboard/knowledge-base/documents",
    },
    {
      id: "nav.knowledgeGraph",
      label: "Go to Knowledge Graph",
      keywords: ["knowledge graph", "graph", "relationships", "entities"],
      group: "navigation",
      href: "/dashboard/knowledge-base/graph",
    },
    {
      id: "nav.enterpriseSearch",
      label: "Go to Enterprise Search",
      keywords: ["search", "semantic search", "ask ai", "enterprise search"],
      group: "navigation",
      href: "/dashboard/search",
    },
    {
      id: "nav.aiMemory",
      label: "Go to AI Memory Manager",
      keywords: ["memory", "ai memory", "long-term memory", "agent memory"],
      group: "navigation",
      href: "/dashboard/ai-command-center/memory",
    },
    {
      id: "nav.subscriptionBilling",
      label: "Go to Subscription & Payment",
      keywords: ["billing", "subscription", "payment", "plan", "checkout", "invoice"],
      group: "navigation",
      href: "/dashboard/billing/subscription",
    },
    {
      id: "nav.usageDashboard",
      label: "Go to Usage",
      keywords: ["usage", "limits", "metering", "quota"],
      group: "navigation",
      href: "/dashboard/billing/usage",
    },
    {
      id: "nav.aiCredits",
      label: "Go to AI Credits",
      keywords: ["ai credits", "tokens", "usage", "claude", "openai"],
      group: "navigation",
      href: "/dashboard/billing/ai-credits",
    },
    {
      id: "nav.agencyPortal",
      label: "Go to Agency Portal",
      keywords: ["agency", "tenants", "clients", "reseller"],
      group: "navigation",
      href: "/dashboard/agency",
    },
    {
      id: "nav.partnerProgram",
      label: "Go to Partner Program",
      keywords: ["partner", "referral", "commission", "payout"],
      group: "navigation",
      href: "/dashboard/partner",
    },
    {
      id: "nav.whiteLabel",
      label: "Go to White Label Settings",
      keywords: ["white label", "branding", "custom domain", "logo"],
      group: "navigation",
      href: "/dashboard/settings/white-label",
    },
    {
      id: "nav.licenses",
      label: "Go to License Management",
      keywords: ["license", "key", "activation", "seats"],
      group: "navigation",
      href: "/dashboard/settings/licenses",
    },
    {
      id: "nav.featureFlags",
      label: "Go to Feature Flags",
      keywords: ["feature flags", "plan features", "overrides"],
      group: "navigation",
      href: "/dashboard/settings/feature-flags",
    },
    {
      id: "theme.toggle",
      label: "Toggle theme",
      keywords: ["theme", "dark mode", "light mode", "appearance"],
      group: "theme",
      action: "toggle-theme",
    },
  ];
}
