import type { Metadata } from "next";

import { Navbar } from "@/components/sections/navbar";
import { DashboardPreview } from "@/components/sections/dashboard-preview";
import { ProblemSolution } from "@/components/sections/problem-solution";
import { Features } from "@/components/sections/features";
import { SocialProof } from "@/components/sections/social-proof";
import { Pricing } from "@/components/sections/pricing";
import { Security } from "@/components/sections/security";
import { FAQ } from "@/components/sections/faq";
import { CTA } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

export const metadata: Metadata = {
  title: "KVL GrowthOS Product Tour",
  description:
    "See the command center, the shift from manual to autonomous growth, and every capability unified in one OS.",
};

/**
 * Product deep-dive, split out of the homepage to keep the homepage a fast,
 * light-on-text landing page (see src/app/page.tsx) — this is where that
 * detail actually lives now, linked from the navbar's "Product tour" item.
 * Distinct from the homepage's #how-it-works anchor, which points at the
 * Workflow step-by-step timeline (src/components/sections/workflow.tsx) —
 * that section stayed on the homepage.
 */
export default function ProductTourPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main>
        <div className="pt-16 sm:pt-24">
          <DashboardPreview />
        </div>
        <ProblemSolution />
        <Features />
        <div id="social-proof">
          <SocialProof />
        </div>
        <div id="pricing">
          <Pricing />
        </div>
        <div id="security">
          <Security />
        </div>
        <div id="faq">
          <FAQ />
        </div>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
