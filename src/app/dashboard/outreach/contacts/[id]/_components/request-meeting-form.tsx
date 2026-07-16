"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { requestMeeting } from "@/app/dashboard/outreach/_lib/meeting-actions";

export function RequestMeetingForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [proposedTimes, setProposedTimes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const times = proposedTimes.split(",").map((t) => t.trim()).filter(Boolean);
      const result = await requestMeeting(contactId, times);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      setProposedTimes("");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarPlus className="size-4" /> Request a meeting
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <AiErrorBanner error={error} kind={errorKind} />}
          <Input
            value={proposedTimes}
            onChange={(e) => setProposedTimes(e.target.value)}
            placeholder="Proposed times, comma-separated (optional) — e.g. Tue 2pm, Wed 10am"
          />
          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Drafting…" : "Generate meeting request"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
