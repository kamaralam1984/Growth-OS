import type { Metadata } from "next";
import { Suspense } from "react";

import { NavbarWithSession as Navbar } from "@/components/sections/navbar-with-session";
import { Footer } from "@/components/sections/footer";
import { Container } from "@/components/ui/container";
import { ContactForm } from "./_components/contact-form";

export const metadata: Metadata = {
  title: "Talk to sales — KVL GrowthOS",
  description: "Tell us about your business and what you're looking for — our team will follow up.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <Container className="flex flex-col items-center gap-6 py-16">
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
