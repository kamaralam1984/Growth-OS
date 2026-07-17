import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { AIAgents } from "@/components/sections/ai-agents";
import { Workflow } from "@/components/sections/workflow";
import { RoiCalculator } from "@/components/sections/roi-calculator";
import { CTA } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

/**
 * Testimonials, pricing, security, and FAQ moved to /product to keep this
 * page a fast, light-on-text landing page — see src/app/product/page.tsx,
 * linked from the navbar's "Product tour" item and the anchors below.
 */
export default function Home() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main>
        <Hero />
        <div id="ai-agents">
          <AIAgents />
        </div>
        <Workflow />
        <div id="roi-calculator">
          <RoiCalculator />
        </div>
        <div id="cta">
          <CTA />
        </div>
      </main>
      <Footer />
    </div>
  );
}
