# CI/CD

## Workflows

- **`.github/workflows/ci.yml`** — runs on every push to `main` and every
  pull request targeting `main`. Two jobs:
  - `build-and-test`: `npm ci` → `prisma generate` → `prisma migrate deploy`
    (against a real `postgres:16` service container) → `npm run lint` →
    `npx tsc --noEmit` → `npm run test` → `npm run build`, all against a
    real `postgres:16` + `redis:7` service pair and a fresh per-run
    `AUTH_SECRET`.
  - `e2e`: builds the app for real and runs `npm run test:e2e`
    (Playwright, against `next start`) with the same service containers.
- **`.github/workflows/deploy.yml`** — manual (`workflow_dispatch`) only,
  parameterized by `environment: staging | production`. Runs migrations and
  a real build against the target environment's own secrets, then stops at
  an explicit `# Configure your real deployment target here` comment — no
  hosting target (Vercel/AWS/etc.) is configured in this repo yet. Includes
  a disabled-by-default `rollback` job skeleton keyed off the `Deployment`
  model's `rollbackOfId` field.

## Required checks for merging to `main`

Until branch protection is configured in the repository's GitHub settings,
document the intended gate here:

- `CI / build-and-test` must pass (lint, typecheck, unit tests, build).
- `CI / e2e` must pass (Playwright smoke suite against a real build).
- At least one approving review.
- Branch must be up to date with `main` before merging (or use GitHub's
  "Require branches to be up to date before merging").
- No direct pushes to `main` — all changes via pull request.

To enforce this: repository **Settings → Branches → Branch protection
rules → `main`** → enable "Require status checks to pass before merging"
and select the `build-and-test` and `e2e` jobs above, plus "Require a pull
request before merging" with at least 1 required approval.

## Secrets required for `deploy.yml`

Configure these as GitHub Environment secrets on the `staging` and
`production` environments (Settings → Environments):

- `DATABASE_URL` — the real environment's Postgres connection string.
- `AUTH_SECRET` — a real, stable secret for that environment (never the
  per-run value CI generates for itself).
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` — required for multi-instance
  deployments so Server Function closures encrypted by one instance decrypt
  on another (see `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`).
- Whatever the real deploy step you wire in requires (e.g. `VERCEL_TOKEN`,
  AWS credentials, a container registry token) — none exist in this
  environment today.
