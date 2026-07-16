// Real k6 load-test script for KVL GrowthOS's read-only public surface.
//
// k6 is a standalone Go binary, NOT an npm package — it is not, and cannot
// be, installed via this project's package.json/npm. Install it separately
// before running this script:
//   macOS:   brew install k6
//   Linux:   https://k6.io/docs/get-started/installation/#linux
//   Docker:  docker run --rm -i grafana/k6 run - < scripts/load-test.js
//
// Usage (against a locally running `next dev`/`next start` or any deployed
// environment):
//   k6 run scripts/load-test.js
//   k6 run -e BASE_URL=https://staging.example.com scripts/load-test.js
//
// Only hits genuinely read-only, unauthenticated endpoints — safe to run
// against a real environment without mutating data or needing test
// credentials.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const errorRate = new Rate("errors");
const homepageDuration = new Trend("homepage_duration", true);
const healthDuration = new Trend("health_duration", true);

// A realistic ramping-VU profile: warm up, hold a moderate steady load,
// spike briefly, then ramp back down — not just a flat constant-VU blast.
export const options = {
  scenarios: {
    ramping_read_traffic: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 }, // warm-up
        { duration: "1m", target: 10 }, // steady baseline
        { duration: "30s", target: 50 }, // spike
        { duration: "1m", target: 50 }, // hold under spike
        { duration: "30s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // fewer than 1% of requests may fail
    http_req_duration: ["p(95)<800"], // 95% of requests under 800ms
    errors: ["rate<0.01"],
  },
};

export default function loadTest() {
  // Homepage — the real public marketing/landing route.
  const homepageRes = http.get(`${BASE_URL}/`, { tags: { name: "homepage" } });
  homepageDuration.add(homepageRes.timings.duration);
  const homepageOk = check(homepageRes, {
    "homepage status is 200": (r) => r.status === 200,
  });
  errorRate.add(!homepageOk);

  sleep(1);

  // /api/health — built by a parallel task (src/lib/monitoring/*); a
  // healthy deploy returns 200, a degraded one 503, both are real, valid
  // responses from this endpoint's documented contract, so only a hard
  // failure (network error, 5xx other than a genuine 503 health report,
  // or 404 if the route hasn't shipped yet) counts against the error rate.
  const healthRes = http.get(`${BASE_URL}/api/health`, { tags: { name: "health" } });
  healthDuration.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    "health responds 200 or 503": (r) => r.status === 200 || r.status === 503,
  });
  errorRate.add(!healthOk);

  sleep(1);
}
