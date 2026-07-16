"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { startMeeting, type StartMeetingResult } from "../actions";

export function StartMeetingButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StartMeetingResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await startMeeting(projectId);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={handleClick} disabled={pending}>
        <Play className="size-4" /> {pending ? "Starting…" : "Start today's standup"}
      </Button>
      {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind as AIErrorKind} />}
    </div>
  );
}
