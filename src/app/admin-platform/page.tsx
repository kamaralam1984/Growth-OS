import type { Metadata } from "next";

import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { CTA } from "@/components/sections/cta";
import { AdminPlatformHero } from "@/components/sections/admin-platform/admin-platform-hero";
import { RealCapabilities } from "@/components/sections/admin-platform/real-capabilities";
import { AdminComingSoon } from "@/components/sections/admin-platform/admin-coming-soon";

export const metadata: Metadata = {
  title: "Enterprise Admin Platform — KVL GrowthOS",
  description: "Real operational tooling for security, compliance, billing, and platform health — with an honest roadmap.",
  alternates: { canonical: "/admin-platform" },
};

/**
 * Enterprise Admin Platform overview. Grounded in
 * src/lib/admin-platform-content.ts, written only after independently
 * verifying which admin capabilities are real vs. not yet built — the
 * admin sidebar's own code comment confirms platform-wide organization/
 * user management is deliberately out of scope so far.
 */
export default function AdminPlatformPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <AdminPlatformHero />
        <RealCapabilities />
        <AdminComingSoon />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
