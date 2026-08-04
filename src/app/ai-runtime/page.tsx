import type { Metadata } from "next";

import { NavbarWithSession as Navbar } from "@/components/sections/navbar-with-session";
import { Footer } from "@/components/sections/footer";
import { CTA } from "@/components/sections/cta";
import { AiRuntimeHero } from "@/components/sections/ai-runtime/ai-runtime-hero";
import { ProviderArchitecture } from "@/components/sections/ai-runtime/provider-architecture";
import { RequestLifecycle } from "@/components/sections/ai-runtime/request-lifecycle";
import { AutoFailover } from "@/components/sections/ai-runtime/auto-failover";
import { CircuitBreaker } from "@/components/sections/ai-runtime/circuit-breaker";
import { QueueManagement } from "@/components/sections/ai-runtime/queue-management";
import { RateLimits } from "@/components/sections/ai-runtime/rate-limits";
import { WorkerInfrastructure } from "@/components/sections/ai-runtime/worker-infrastructure";
import { ReliabilityCenter } from "@/components/sections/ai-runtime/reliability-center";
import { AiSecurity } from "@/components/sections/ai-runtime/ai-security";
import { CostDashboard } from "@/components/sections/ai-runtime/cost-dashboard";
import { DeveloperApis } from "@/components/sections/ai-runtime/developer-apis";
import { AiRuntimeResources } from "@/components/sections/ai-runtime/ai-runtime-resources";
import { AiRoadmap } from "@/components/sections/ai-runtime/ai-roadmap";

export const metadata: Metadata = {
  title: "AI Runtime & Reliability — KVL GrowthOS",
  description: "How the AI infrastructure works — providers, failover, queues, and reliability, with no fabricated claims.",
  alternates: { canonical: "/ai-runtime" },
};

/**
 * AI Runtime & Reliability page. Every section is grounded in
 * src/lib/ai-runtime-content.ts, which was written only after independently
 * verifying each claim against this codebase — nothing here claims AI
 * response caching, a formal circuit-breaker state machine, per-provider
 * real-time latency dashboards, or active multi-instance worker scaling,
 * since none of those are real yet.
 */
export default function AiRuntimePage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <AiRuntimeHero />
        <ProviderArchitecture />
        <RequestLifecycle />
        <AutoFailover />
        <CircuitBreaker />
        <QueueManagement />
        <RateLimits />
        <WorkerInfrastructure />
        <ReliabilityCenter />
        <AiSecurity />
        <CostDashboard />
        <DeveloperApis />
        <AiRuntimeResources />
        <AiRoadmap />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
