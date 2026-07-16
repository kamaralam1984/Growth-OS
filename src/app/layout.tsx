import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// TODO: replace with the real production domain before launch (keep in sync with sitemap.ts / robots.ts).
const BASE_URL = "https://kvlgrowthos.com";

const title = "KVL GrowthOS — The AI Workforce That Grows Your Business 24/7";
const description =
  "KVL GrowthOS is a team of AI agents that qualifies leads, runs outreach, drafts proposals, and prioritizes your pipeline around the clock — so deals move forward whether or not anyone's logged in.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: BASE_URL,
    siteName: "KVL GrowthOS",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "KVL GrowthOS",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description,
  url: BASE_URL,
  publisher: {
    "@type": "Organization",
    name: "KVL Business Solutions",
    url: BASE_URL,
  },
  offers: {
    "@type": "Offer",
    price: "149",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
