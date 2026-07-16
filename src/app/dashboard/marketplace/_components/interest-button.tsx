"use client";

import { useState, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { registerMarketplaceInterest } from "../actions";

export function InterestButton({ listingId, alreadyInterested }: { listingId: string; alreadyInterested: boolean }) {
  const [registered, setRegistered] = useState(alreadyInterested);
  const [pending, startTransition] = useTransition();

  if (registered) {
    return (
      <Button variant="outline" size="sm" disabled>
        <BellRing className="size-3.5" />
        We&rsquo;ll notify you
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await registerMarketplaceInterest(listingId);
          if (result.ok) setRegistered(true);
        })
      }
    >
      <Bell className="size-3.5" />
      {pending ? "Saving…" : "Notify me"}
    </Button>
  );
}
