"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { respondToReviewAction, removeReviewAction } from "../actions";

export function ReviewModerationRow({
  reviewId,
  listingName,
  rating,
  title,
  body,
  authorLabel,
  existingResponse,
}: {
  reviewId: string;
  listingName: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorLabel: string;
  existingResponse: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState("");

  function handleRespond() {
    startTransition(async () => {
      const result = await respondToReviewAction(reviewId, response);
      if (!result.ok) {
        toast.error(result.error ?? "Could not respond.");
        return;
      }
      toast.success("Response posted.");
      setResponse("");
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeReviewAction(reviewId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove review.");
        return;
      }
      toast.success("Review removed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{listingName}</Badge>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={`size-3.5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            ))}
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={pending}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      <p className="text-xs text-muted-foreground">— {authorLabel}</p>
      {existingResponse ? (
        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Response: </span>
          {existingResponse}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input placeholder="Respond to this review..." value={response} onChange={(e) => setResponse(e.target.value)} className="h-9" />
          <Button type="button" size="sm" onClick={handleRespond} disabled={pending || !response.trim()}>
            <Send className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
