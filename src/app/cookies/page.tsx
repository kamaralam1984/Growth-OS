import type { Metadata } from "next";

import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Container } from "@/components/ui/container";
import { DraftLegalBanner } from "@/components/draft-legal-banner";

export const metadata: Metadata = {
  title: "Cookie Policy — KVL GrowthOS",
  description: "Which cookies KVL GrowthOS uses, and your choices about them.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <Container className="max-w-3xl py-16">
          <DraftLegalBanner />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Cookie Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 2026-07-28</p>

          <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Essential cookies</h2>
              <p>
                Always on, and not optional — these keep you signed in and remember your cookie preference itself.
                Without them, the product doesn&apos;t function.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Analytics cookies</h2>
              <p>
                Off by default. If you opt in via the cookie banner, we set a first-party, same-site identifier used
                only to understand aggregate usage of this marketing site (e.g. which buttons get clicked) — never
                shared with a third-party advertising network.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Marketing cookies</h2>
              <p>
                Off by default, and not currently used by this deployment — this category exists in our consent
                banner in case a non-essential marketing cookie is added in the future.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Managing your preference</h2>
              <p>
                You can change your choice at any time by clearing the <code>growthos_cookie_consent</code> cookie in
                your browser, which brings the consent banner back the next time you visit.
              </p>
            </section>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
