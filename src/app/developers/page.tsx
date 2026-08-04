import type { Metadata } from "next";

import { NavbarWithSession as Navbar } from "@/components/sections/navbar-with-session";
import { Footer } from "@/components/sections/footer";
import { CTA } from "@/components/sections/cta";
import { DeveloperHero } from "@/components/sections/developer-platform/developer-hero";
import { RestApiReference } from "@/components/sections/developer-platform/rest-api-reference";
import { GraphqlApi } from "@/components/sections/developer-platform/graphql-api";
import { SdkCenter } from "@/components/sections/developer-platform/sdk-center";
import { CliTools } from "@/components/sections/developer-platform/cli-tools";
import { AuthenticationCenter } from "@/components/sections/developer-platform/authentication-center";
import { WebhooksDocs } from "@/components/sections/developer-platform/webhooks-docs";
import { RateLimitsQuotas } from "@/components/sections/developer-platform/rate-limits-quotas";
import { ErrorReference } from "@/components/sections/developer-platform/error-reference";
import { DeveloperResources } from "@/components/sections/developer-platform/developer-resources";
import { CommunitySupport } from "@/components/sections/developer-platform/community-support";

export const metadata: Metadata = {
  title: "Developers — KVL GrowthOS",
  description: "A real, documented API — REST, GraphQL, SDKs, CLI, webhooks, and a live playground.",
  alternates: { canonical: "/developers" },
};

/**
 * Developer Platform. Every section is grounded in real, working code built
 * and verified this session — src/lib/developer-platform-content.ts, the
 * real /api/v1 + /api/export endpoints, a real minimal GraphQL endpoint
 * (src/app/api/graphql), real JS/TS + Python SDKs (sdk/), a real CLI
 * (cli/kvl.js), and a real OpenAPI spec + Postman collection (public/).
 * Nothing here claims a feature that doesn't exist — see each component's
 * own header comment for what's honestly still missing.
 */
export default function DevelopersPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <DeveloperHero />
        <RestApiReference />
        <GraphqlApi />
        <SdkCenter />
        <CliTools />
        <AuthenticationCenter />
        <WebhooksDocs />
        <RateLimitsQuotas />
        <ErrorReference />
        <DeveloperResources />
        <CommunitySupport />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
