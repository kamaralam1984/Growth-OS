// Real PM2 process-manager config for a bare-metal/VM deployment WITHOUT
// Docker — an alternative topology to docker-compose.yml, not a
// replacement for it. Runs the same real `output: "standalone"` build
// Dockerfile uses (see next.config.ts) via its generated server.js, so the
// prerequisite is identical either way: `npm run build` must have already
// produced `.next/standalone/server.js` in this directory.
//
// Usage:
//   npm run build
//   pm2 start ecosystem.config.js
//   pm2 status / pm2 logs kvl-growthos / pm2 reload kvl-growthos (zero-downtime)
//
// All real secrets (DATABASE_URL, AUTH_SECRET, encryption keys, AI/payment
// provider keys — see .env.example for the full list) are intentionally
// NOT hardcoded here. PM2 reads process.env at start time, so export them
// in the shell/systemd unit that runs `pm2 start`, or point PM2 at a real
// .env file with `pm2 start ecosystem.config.js --env production` after
// adding `env_file: ".env"`-style loading via a tool like `dotenv-cli` —
// this file deliberately doesn't bake any credential into version control.
module.exports = {
  apps: [
    {
      name: "kvl-growthos",
      // The standalone build's own generated entrypoint (same one
      // Dockerfile's runner stage runs via `node server.js`), NOT `next
      // start` — see src/app/api/... comments elsewhere in this repo
      // about "next start does not work with output: standalone".
      script: ".next/standalone/server.js",
      cwd: __dirname,
      // Cluster mode load-balances across every CPU core behind one
      // logical PM2 app — real horizontal scaling on a single box, the
      // same real multi-instance topology the Redis-backed distributed
      // rate limiter (src/lib/security/rate-limit-distributed.ts) and
      // BullMQ scheduler are already built to be correct under.
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
      // Real crash-loop protection — restart on crash, but stop retrying
      // if it crashes more than 10 times within 60s (a genuine startup
      // failure, e.g. a missing DATABASE_URL, should surface as "stopped"
      // in `pm2 status`, not spin forever).
      max_restarts: 10,
      min_uptime: "60s",
      autorestart: true,
      // Graceful shutdown — gives in-flight requests (and the BullMQ
      // scheduler's in-process job locks) a real window to finish before
      // PM2 sends SIGKILL on reload/stop.
      kill_timeout: 10_000,
      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
