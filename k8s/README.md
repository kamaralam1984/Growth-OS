# Kubernetes deployment manifests

Real, valid manifests for running this app's own Docker image (see `../Dockerfile`) on a
Kubernetes cluster — an alternative topology to `docker-compose.yml` (single VPS) and
`ecosystem.config.js` (bare-metal PM2), for a real multi-node/auto-scaled deployment.

## What's here

| File | Purpose |
|---|---|
| `namespace.yaml` | Isolates every resource below under `kvl-growthos` |
| `configmap.yaml` | Non-secret runtime config (`NODE_ENV`, feature toggles) |
| `secret.example.yaml` | **Template only** — copy to `secret.yaml`, fill in real values, never commit `secret.yaml` |
| `deployment.yaml` | The app itself — 2+ replicas, real liveness/readiness probes against `/api/health` |
| `service.yaml` | Internal ClusterIP routing to the Deployment's pods |
| `ingress.yaml` | Real HTTPS ingress (cert-manager annotations for automatic Let's Encrypt) |
| `hpa.yaml` | HorizontalPodAutoscaler — real CPU/memory-based autoscaling, 2–10 replicas |
| `migration-job.yaml` | A one-shot Job that runs `prisma migrate deploy` before/during a rollout |

## What this deliberately does NOT include

- **Postgres/Redis manifests.** Real production Kubernetes deployments almost always use a
  managed database (RDS/Cloud SQL/Azure Database for PostgreSQL, ElastiCache/Memorystore/Azure
  Cache for Redis) rather than self-hosting stateful services in-cluster — StatefulSets for
  Postgres are a real, valid option but a different operational commitment (backup/failover
  tooling, PVC storage class choice) than this app's own concern. Point `DATABASE_URL`/
  `REDIS_URL` in `secret.yaml` at your real managed instances.
- **A Helm chart.** These are plain manifests, deliberately — a Helm chart is a reasonable
  follow-up once real per-environment (staging/production) value differences exist, but
  wrapping 7 files in a templating layer before that need is real would be premature.

## Usage

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
cp secret.example.yaml secret.yaml   # fill in real values first — see .env.example for what each key needs
kubectl apply -f secret.yaml
kubectl apply -f migration-job.yaml
kubectl wait --for=condition=complete job/kvl-growthos-migrate -n kvl-growthos --timeout=120s
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml
```

Update `deployment.yaml`'s `image:` field to point at your real, pushed image (see
`.github/workflows/deploy.yml` — it already builds and pushes to GHCR on every deploy run).

## Validation

No `kubectl`/live cluster was available in the environment these manifests were authored in —
they were hand-validated for schema/API correctness against the real Dockerfile contract
(`EXPOSE 3000`, `CMD ["node", "server.js"]`, `GET /api/health`) but have **not** been applied
against a real cluster. Run `kubectl apply --dry-run=client -f .` (or `--dry-run=server` against
a real cluster) before a real rollout.
