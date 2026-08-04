import type { Metadata } from "next";

import { NavbarWithSession as Navbar } from "@/components/sections/navbar-with-session";
import { Footer } from "@/components/sections/footer";
import { Container } from "@/components/ui/container";
import { DraftLegalBanner } from "@/components/draft-legal-banner";

export const metadata: Metadata = {
  title: "Privacy Policy — KVL GrowthOS",
  description: "How KVL GrowthOS collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <Container className="max-w-3xl py-16">
          <DraftLegalBanner />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 2026-07-28</p>

          <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">1. Information we collect</h2>
              <p>
                When you create an account, we collect the details you provide during registration and onboarding
                (name, email, company, job title, and similar profile information). When you use the product, we
                store the business data you enter — CRM records, proposals, projects, and so on — so the product can
                function. When you submit our contact form, we store what you submit (name, company, email, and your
                message) so our team can respond.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">2. How we use your information</h2>
              <p>
                We use your information to operate the product, respond to support and sales inquiries, send
                account-related emails (verification, password reset, security alerts), and — only if you&apos;ve
                opted in via our cookie banner — to understand aggregate usage of our marketing site.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">3. Third parties we may share data with</h2>
              <p>
                Depending on which optional integrations your organization enables, data may be shared with the
                specific third-party providers you connect (e.g. an email provider for sending mail, an AI provider
                for AI features, a payment gateway for billing). We do not sell your data to third parties.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">4. Cookies</h2>
              <p>
                We use strictly-necessary cookies (authentication/session, and remembering your cookie preference
                itself) at all times. Analytics cookies are only set if you actively opt in via the cookie banner.
                See our <a href="/cookies" className="text-foreground underline underline-offset-4">Cookie Policy</a>{" "}
                for details.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">5. Your rights</h2>
              <p>
                Depending on your jurisdiction, you may have the right to access, correct, export, or delete your
                personal data. To make a request, reach out via our{" "}
                <a href="/contact" className="text-foreground underline underline-offset-4">contact form</a>.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">6. Changes to this policy</h2>
              <p>
                We may update this policy from time to time. Material changes will be reflected by updating the
                &ldquo;Last updated&rdquo; date above.
              </p>
            </section>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
