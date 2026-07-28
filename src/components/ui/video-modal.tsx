"use client";

import Link from "next/link";
import { PlayCircle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface VideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * No real product demo video exists yet — this is the honest "coming soon"
 * state, not a populated-but-empty player with fake chapters/transcript UI.
 * Same visual language as src/app/profile/_components/coming-soon-card.tsx.
 */
export function VideoModal({ open, onOpenChange }: VideoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Product demo</DialogTitle>
            <Badge variant="accent">Coming soon</Badge>
          </div>
          <DialogDescription>Our full product walkthrough video is on its way.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
          <PlayCircle className="size-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">
            Check back soon — in the meantime, our team is happy to walk you through it live.
          </p>
        </div>
        <Button asChild className="mt-6 w-full">
          <Link href="/contact?department=SALES" onClick={() => onOpenChange(false)}>
            Talk to sales instead
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
