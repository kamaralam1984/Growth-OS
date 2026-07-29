"use client";

import { motion } from "framer-motion";
import {
  Globe,
  Lock,
  Server,
  Database,
  MemoryStick,
  KeyRound,
  Save,
  Activity,
  FileText,
  BellRing,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp, staggerContainer } from "@/animations";

/**
 * A static, honest diagram of how a request actually flows through this
 * deployment — not data-driven from security-content.ts. Infra language is
 * deliberately kept generic: no cloud provider, no region, and no
 * CDN/firewall/load-balancer/WAF, since none of those are real here.
 */

interface ArchitectureStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

type ArchitectureNode =
  | { type: "step"; step: ArchitectureStep }
  | { type: "group"; steps: ArchitectureStep[] };

const ARCHITECTURE_FLOW: ArchitectureNode[] = [
  {
    type: "step",
    step: {
      title: "Browser",
      description: "Your team and customers connect over HTTPS from any standard web browser.",
      icon: Globe,
    },
  },
  {
    type: "step",
    step: {
      title: "Reverse Proxy (TLS Termination)",
      description: "Incoming traffic is decrypted and routed by a reverse proxy in front of the application.",
      icon: Lock,
    },
  },
  {
    type: "step",
    step: {
      title: "Application (Containerized)",
      description: "The application runs in an isolated container, as a non-root user, with resource limits.",
      icon: Server,
    },
  },
  {
    type: "group",
    steps: [
      {
        title: "Database (PostgreSQL)",
        description: "Application data is persisted in PostgreSQL and never exposed to the public internet.",
        icon: Database,
      },
      {
        title: "Cache (Redis, Internal-Only)",
        description: "Redis handles caching and rate limiting, reachable only from inside the internal network.",
        icon: MemoryStick,
      },
    ],
  },
  {
    type: "step",
    step: {
      title: "Encrypted Storage & Secrets",
      description: "Sensitive data and credentials are encrypted at rest, each domain under its own independent key.",
      icon: KeyRound,
    },
  },
  {
    type: "step",
    step: {
      title: "Automated Backups",
      description: "A nightly job produces a checksummed, verified database backup automatically.",
      icon: Save,
    },
  },
  {
    type: "step",
    step: {
      title: "Health Monitoring",
      description: "Database, cache, storage, and job-queue health are checked continuously and recorded over time.",
      icon: Activity,
    },
  },
  {
    type: "step",
    step: {
      title: "Audit Logs",
      description: "Sensitive actions are recorded in a tamper-evident, hash-chained audit trail.",
      icon: FileText,
    },
  },
  {
    type: "step",
    step: {
      title: "Alerting",
      description: "Critical failures trigger automated alerts to our operations channel the moment they're detected.",
      icon: BellRing,
    },
  },
];

function StepCard({ step }: { step: ArchitectureStep }) {
  const Icon = step.icon;
  return (
    <Card glass className="flex w-full max-w-md flex-col gap-2 p-5">
      <span className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
        <span className="text-sm font-semibold text-foreground">{step.title}</span>
      </span>
      <p className="text-sm text-muted-foreground">{step.description}</p>
    </Card>
  );
}

function FlowArrow() {
  return (
    <span aria-hidden className="flex justify-center py-1">
      <ChevronDown className="size-5 text-muted-foreground" />
    </span>
  );
}

function SecurityArchitecture() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Architecture"
          title="How a request actually flows through this system"
          description="A real, current picture of the request path — deliberately described in generic infrastructure terms, not a diagram of aspirational infrastructure."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="flex w-full max-w-md flex-col items-center"
        >
          {ARCHITECTURE_FLOW.map((node, index) => (
            <div key={index} className="flex w-full flex-col items-center">
              {node.type === "step" ? (
                <motion.div variants={fadeInUp} className="flex w-full justify-center">
                  <StepCard step={node.step} />
                </motion.div>
              ) : (
                <motion.div
                  variants={fadeInUp}
                  className="flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-4"
                >
                  {node.steps.map((step) => (
                    <StepCard key={step.title} step={step} />
                  ))}
                </motion.div>
              )}
              {index < ARCHITECTURE_FLOW.length - 1 && <FlowArrow />}
            </div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}

export default SecurityArchitecture;
export { SecurityArchitecture };
