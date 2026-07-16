import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { OnboardingWizard } from "./_components/onboarding-wizard";
import { createOrContinueOrganization } from "./actions";

/**
 * Server Component entry point for the onboarding wizard. Loads (or lazily
 * creates) the current user's Organization on every render, so refreshing or
 * returning to /onboarding later always resumes with whatever was already
 * auto-saved rather than restarting the wizard from scratch.
 */
export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fonboarding");
  }

  const result = await createOrContinueOrganization();
  if (!result.ok || !result.organization) {
    redirect("/login?callbackUrl=%2Fonboarding");
  }

  return <OnboardingWizard organization={result.organization} />;
}
