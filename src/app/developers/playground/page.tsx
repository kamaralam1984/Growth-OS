import type { Metadata } from "next";

import { NavbarWithSession as Navbar } from "@/components/sections/navbar-with-session";
import { Footer } from "@/components/sections/footer";
import { ApiPlayground } from "@/components/sections/developer-platform/api-playground";

export const metadata: Metadata = {
  title: "API Playground — KVL GrowthOS",
  description: "Paste your own API key and send real, live requests to the GrowthOS API directly from your browser.",
  alternates: { canonical: "/developers/playground" },
};

export default function ApiPlaygroundPage() {
  return (
    <div className="theme-luxury">
      <Navbar />
      <main className="pt-16 sm:pt-24">
        <ApiPlayground />
      </main>
      <Footer />
    </div>
  );
}
