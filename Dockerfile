# Multi-stage production Docker build for this Next.js 16 app, following
# node_modules/next/dist/docs/01-app/02-guides/self-hosting.md's
# standalone-output pattern (next.config.ts sets `output: "standalone"`).
#
# Build:  docker build -t kvl-growthos .
# Run:    docker run -p 3000:3000 --env-file .env kvl-growthos
# (or use docker-compose.yml, which wires real postgres/redis services.)

# ---------- deps: install once, reused by the build stage's cache ----------
FROM node:20-alpine AS deps
WORKDIR /app

# openssl is required by Prisma's query engine on Alpine (musl) images.
RUN apk add --no-cache openssl

COPY package.json package-lock.json prisma.config.ts ./
# package.json's postinstall script runs `prisma generate`, which needs the
# real schema (and prisma.config.ts, which points at it — see that file's
# own "Loaded Prisma config from prisma.config.ts" log line) — copy both in
# before `npm ci` runs, or postinstall fails with "Could not find Prisma
# Schema" before any dependency is even usable.
COPY prisma ./prisma
RUN npm ci

# ---------- build: compile the real Next.js production build ----------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Real values are unnecessary at build time beyond what `next build`
# genuinely needs to type-check/prerender — this app is designed to degrade
# honestly to "Not Configured" for every optional integration (see
# .env.example), so a syntactically valid placeholder DATABASE_URL is
# enough for the build step itself. Real secrets are supplied at container
# runtime (see docker-compose.yml / the `runner` stage below), never baked
# into the image.
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL="postgresql://user:password@localhost:5432/kvl_growthos?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

RUN npx prisma generate
RUN npm run build

# ---------- runner: minimal production image ----------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user — standard Next.js standalone-output pattern.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# `output: "standalone"` traces the minimal production dependency subset
# into .next/standalone (including a generated server.js) and copies static
# assets separately into .next/static — see next.config.ts and the
# self-hosting guide referenced above.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# pdfkit is excluded from the standalone trace (serverExternalPackages in
# next.config.ts — it reads .afm font files from disk via native `require`,
# which tracing/bundling would break) so its real package files must be
# copied in explicitly, not just relied on the standalone trace.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfkit ./node_modules/pdfkit

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
