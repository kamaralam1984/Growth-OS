"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { submitReviewAction } from "../_lib/review-actions";

export function ReviewForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitReviewAction({ listingId, rating, title, body });
      if (!result.ok) {
        toast.error(result.error ?? "Could not submit review.");
        return;
      }
      toast.success("Review submitted.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className="p-0.5">
            <Star className={cn("size-5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        placeholder="Share your real experience with this install..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
