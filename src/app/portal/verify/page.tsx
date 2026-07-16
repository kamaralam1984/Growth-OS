import { redirect } from "next/navigation";

import { VerifyClient } from "./_components/verify-client";

export default async function PortalVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; callbackUrl?: string }> }) {
  const { token, callbackUrl } = await searchParams;
  if (!token) redirect("/portal/login");

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <VerifyClient token={token} redirectTo={callbackUrl ?? "/portal/dashboard"} />
    </main>
  );
}
