import { Container } from "@/components/ui/container";

import { ProposalNav } from "./_components/proposal-nav";

/**
 * Shared chrome for every /dashboard/proposal/* route — mirrors the CRM
 * section's layout.tsx + crm-nav.tsx pattern exactly (sticky sub-nav below
 * the outer dashboard header, no extra auth check since every page here
 * still calls requireActiveMembership() itself).
 */
export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-16 z-20 border-b border-border bg-background/80 backdrop-blur">
        <Container>
          <ProposalNav />
        </Container>
      </div>
      {children}
    </div>
  );
}
