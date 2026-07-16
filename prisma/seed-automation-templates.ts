import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { ensureAutomationTemplatesSeeded } from "@/lib/workflows/template-catalog";

/**
 * One-off CLI seed for the 9 prebuilt AutomationTemplate rows (`npm run
 * db:seed`). The actual template data and upsert logic live in
 * src/lib/workflows/template-catalog.ts, shared with the Template
 * Marketplace page's lazy on-load seeding — this script is just a thin CLI
 * entry point so a fresh environment can seed once without visiting the page.
 */
async function main() {
  await ensureAutomationTemplatesSeeded();
  const count = await prisma.automationTemplate.count();
  console.log(`Seeded automation templates. AutomationTemplate row count: ${count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
