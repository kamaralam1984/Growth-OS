import { Card, CardContent } from "@/components/ui/card";
import { VerifyClient } from "./_components/verify-client";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      {token ? (
        <VerifyClient token={token} />
      ) : (
        <Card glass className="w-full max-w-md">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            This verification link is missing its token.
          </CardContent>
        </Card>
      )}
    </main>
  );
}
