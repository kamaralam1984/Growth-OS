import { Container } from "@/components/ui/container";

import { CrmNav } from "./_components/crm-nav";

/**
 * Shared chrome for every /dashboard/crm/* route: a sticky sub-nav bar
 * (Dashboard/Pipeline/Deals/Contacts/Tasks/Calendar/Activity/Team/Forecast/
 * Reports), mirroring the /board section's own BoardNav pattern
 * (src/app/board/_components/board-nav.tsx). The outer header/sidebar/auth
 * gating is already provided by src/app/dashboard/layout.tsx — every CRM
 * page still calls requireActiveMembership() itself, same as every other
 * /dashboard/* page, so this layout adds only the sub-nav, not another
 * auth check.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-16 z-20 border-b border-border bg-background/80 backdrop-blur">
        <Container>
          <CrmNav />
        </Container>
      </div>
      {children}
    </div>
  );
}
