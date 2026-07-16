import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { AIAgents } from "@/components/sections/ai-agents";
import { ProblemSolution } from "@/components/sections/problem-solution";
import { Workflow } from "@/components/sections/workflow";
import { Features } from "@/components/sections/features";
import { SocialProof } from "@/components/sections/social-proof";
import { RoiCalculator } from "@/components/sections/roi-calculator";
import { Pricing } from "@/components/sections/pricing";
import { Security } from "@/components/sections/security";
import { FAQ } from "@/components/sections/faq";
import { CTA } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main>
        <Hero />
        <div id="ai-agents">
          <AIAgents />
        </div>
        <ProblemSolution />
        <Workflow />
        <Features />
        <div id="social-proof">
          <SocialProof />
        </div>
        <div id="roi-calculator">
          <RoiCalculator />
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
        <div id="cta">
          <CTA />
        </div>
      </main>
      <Footer />
    </div>
  );
}
