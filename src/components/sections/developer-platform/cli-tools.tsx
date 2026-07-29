"use client";

import { motion } from "framer-motion";
import { Terminal } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { fadeInUp } from "@/animations";

const CLI_COMMANDS = [
  { command: "kvl auth <apiKey> [--base-url <url>]", description: "Save your API key locally." },
  { command: "kvl workflows:trigger <workflowId>", description: "Trigger a real workflow run." },
  { command: "kvl export:companies [--format csv|crm|excel|pdf]", description: "Export your companies to a local file." },
  { command: "kvl export:deals [--format csv|excel|pdf]", description: "Export your deals to a local file." },
  { command: "kvl export:contacts [--format csv|excel|pdf]", description: "Export your contacts to a local file." },
  { command: "kvl --help", description: "List real commands." },
];

/** Real, working CLI (cli/kvl.js in the repo) — not yet published to npm, so install is "clone + node", not a package-manager one-liner. */
function CliTools() {
  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-10">
        <SectionHeading
          eyebrow="CLI"
          title="A real command-line client"
          description="Every command below genuinely works against the live API — not a mockup."
        />
        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="w-full max-w-2xl">
          <Card glass className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Terminal className="size-4 text-primary" strokeWidth={2.5} />
              Not published to npm yet — run it directly
            </div>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-foreground">
              <code>{`git clone <this repo>\ncd growthos\nnode cli/kvl.js --help`}</code>
            </pre>
          </Card>
        </motion.div>
        <div className="flex w-full max-w-2xl flex-col gap-3">
          {CLI_COMMANDS.map((cmd) => (
            <div key={cmd.command} className="flex flex-col gap-1 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <code className="text-xs text-foreground">{cmd.command}</code>
              <span className="text-xs text-muted-foreground">{cmd.description}</span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default CliTools;
export { CliTools };
