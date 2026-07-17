import { Globe, Mail, MessageCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/brand/logo";

const LINK_GROUPS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/product" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/product#pricing" },
      { label: "Integrations", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
      // Real, public, unauthenticated status page — see src/app/status/page.tsx.
      { label: "System Status", href: "/status" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
] as const;

const SOCIAL_LINKS = [
  { label: "Website", icon: Globe, href: "#" },
  { label: "Email", icon: Mail, href: "#" },
  { label: "Chat with us", icon: MessageCircle, href: "#" },
] as const;

function Footer() {
  return (
    <footer className="relative border-t border-border py-16">
      <Container>
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <a href="#top" className="text-lg font-semibold">
              <Logo />
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              The AI-powered business growth operating system that unifies
              acquisition, growth intelligence, and execution into one
              command center.
            </p>
            <div className="mt-2 flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, icon: Icon, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="size-4" strokeWidth={2} />
                </a>
              ))}
            </div>
          </div>

          {LINK_GROUPS.map((group) => (
            <div key={group.heading} className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {group.heading}
              </h3>
              <ul className="flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 border-t border-border pt-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-muted-foreground">
            © 2026 KVL Business Solutions. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built for growth teams that move fast.
          </p>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
export { Footer };
