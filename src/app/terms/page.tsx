import type { Metadata } from "next";

import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Container } from "@/components/ui/container";
import { DraftLegalBanner } from "@/components/draft-legal-banner";

export const metadata: Metadata = {
  title: "Terms of Service — KVL GrowthOS",
  description: "The terms that govern your use of KVL GrowthOS.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <Container className="max-w-3xl py-16">
          <DraftLegalBanner />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 2026-07-28</p>

          <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">1. Acceptance of terms</h2>
              <p>
                By creating an account or otherwise using KVL GrowthOS, you agree to these terms. If you&apos;re
                using the product on behalf of an organization, you&apos;re confirming you have authority to bind
                that organization to these terms.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">2. Your account</h2>
              <p>
                You&apos;re responsible for keeping your login credentials secure and for all activity under your
                account. Let us know right away if you suspect unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">3. Subscriptions and billing</h2>
              <p>
                Paid plans are billed on the cycle you choose at signup. Fees are non-refundable except where
                required by law or explicitly stated otherwise. You can cancel at any time from your billing
                settings; cancellation takes effect at the end of your current billing period.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">4. Acceptable use</h2>
              <p>
                Don&apos;t use the product to violate any law, infringe anyone&apos;s rights, send unsolicited bulk
                messages, or attempt to disrupt or gain unauthorized access to our systems.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">5. Your data</h2>
              <p>
                You own the data you put into the product. We use it only to provide the service to you, as
                described in our <a href="/privacy" className="text-foreground underline underline-offset-4">Privacy Policy</a>.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">6. Disclaimers and liability</h2>
              <p>
                The product is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law, we disclaim warranties of
                any kind, and our liability for any claim is limited to the amount you paid us in the twelve months
                before the claim arose.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">7. Changes to these terms</h2>
              <p>
                We may update these terms from time to time. Material changes will be reflected by updating the
                &ldquo;Last updated&rdquo; date above. Questions? Reach out via our{" "}
                <a href="/contact" className="text-foreground underline underline-offset-4">contact form</a>.
              </p>
            </section>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
