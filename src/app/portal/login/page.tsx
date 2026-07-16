import { PortalLoginForm } from "../_components/login-form";

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <PortalLoginForm callbackUrl={callbackUrl} />
    </main>
  );
}
