"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { convertMeetingActionItemToTracked } from "../actions";

export function TrackActionItemRow({
  meetingId,
  text,
  tracked,
  canTrack,
}: {
  meetingId: string;
  text: string;
  tracked: boolean;
  canTrack: boolean;
}) {
  const router = useRouter();
  const [isTracked, setIsTracked] = useState(tracked);
  const [pending, startTransition] = useTransition();

  function track() {
    startTransition(async () => {
      const result = await convertMeetingActionItemToTracked(meetingId, text);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong tracking this action item.");
        return;
      }
      setIsTracked(true);
      toast.success("Action item is now tracked.");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <span>{text}</span>
      {isTracked ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          <CheckCircle2 className="size-3.5" /> Tracked
        </span>
      ) : canTrack ? (
        <Button size="sm" variant="outline" className="shrink-0" onClick={track} disabled={pending}>
          {pending ? "Tracking..." : "Track this"}
        </Button>
      ) : null}
    </div>
  );
}
