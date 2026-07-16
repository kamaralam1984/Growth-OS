/**
 * Per-organization cron timezone resolution — real plumbing, not yet wired
 * into any registered job.
 *
 * This app's 11 jobs in registry.ts are all CROSS-ORG loops: one BullMQ cron
 * tick fires the handler once, and the handler iterates every organization
 * internally (e.g. `prisma.organization.findMany` then a for-loop). A single
 * `timezone` on a JobDefinition like that can't mean "each org's own local
 * time" — there is no one tz to hand BullMQ, because the job runs for every
 * org at once. That's why JOB_DEFINITIONS in registry.ts leaves `timezone`
 * unset today (server default — see JobDefinition.timezone's JSDoc in
 * types.ts for the confirmed non-UTC default).
 *
 * Getting real per-org local-time scheduling requires a different
 * architecture: one BullMQ repeatable job PER organization (or per
 * workflow), each registered with `tz` set to that row's own timezone —
 * i.e. N calls to `queue.upsertJobScheduler` with N distinct job keys
 * instead of one cross-org job. That's the shape the Workflow execution
 * engine (a later batch) needs, and this function is what it should call
 * per organization/workflow when building each job's repeat options.
 */
export function resolveOrgCronOptions(organizationTimezone: string | null): { tz?: string } {
  return organizationTimezone ? { tz: organizationTimezone } : {};
}
