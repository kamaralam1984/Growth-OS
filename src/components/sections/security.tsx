import {
  Eye,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface SecurityPractice {
  icon: LucideIcon;
  title: string;
  description: string;
}

const PRACTICES: SecurityPractice[] = [
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    description:
      "All traffic is encrypted with TLS 1.2+ and stored data is encrypted at rest, across every service in the stack.",
  },
  {
    icon: KeyRound,
    title: "Role-based access control",
    description:
      "Every workspace member gets the minimum permissions their role requires, enforced consistently at the API layer.",
  },
  {
    icon: Eye,
    title: "Audit logging",
    description:
      "Agent actions and administrative changes are logged with a timestamp and actor, and retained for review.",
  },
  {
    icon: Globe,
    title: "Data residency controls",
    description:
      "Choose where your workspace data is stored and processed to match your team's regulatory requirements.",
  },
  {
    icon: ShieldCheck,
    title: "Regular access reviews",
    description:
      "Internal access to production systems is reviewed on a recurring cadence and revoked the moment it's no longer needed.",
  },
  {
    icon: Fingerprint,
    title: "Secure secret management",
    description:
      "API keys and credentials live in a dedicated secrets vault, never committed to code or written to logs.",
  },
];

function Security() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-16">
        <SectionHeading
          eyebrow="Security & trust"
          title="Built for enterprise trust"
          description="GrowthOS is engineered with the same access-control and data-handling discipline your security team expects from any system that touches customer data."
        />

        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRACTICES.map((practice) => {
            const Icon = practice.icon;
            return (
              <Card key={practice.title} glass className="flex flex-col gap-4 p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {practice.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {practice.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

export default Security;
export { Security };
