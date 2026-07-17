"use client";

import { useState, useTransition } from "react";
import { Link2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { createPlatformInvoiceShareLinkAction } from "../actions";

/**
 * "Get shareable link" for a single platform invoice PDF — issues a real,
 * time-limited signed download URL (src/lib/storage/signed-url.ts, via
 * /api/files/signed/[token]) that works for whoever the org shares it with,
 * without them ever needing a GrowthOS login. Generated on demand (not
 * pre-computed) so each click reflects the current SHARE_LINK_EXPIRES_SECONDS
 * window from that moment.
 */
export function ShareInvoiceLinkDialog({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);

  function handleGenerate() {
    startTransition(async () => {
      const result = await createPlatformInvoiceShareLinkAction(invoiceId);
      if (!result.ok || !result.url) {
        toast.error(result.error ?? "Could not create a shareable link.");
        return;
      }
      setUrl(result.url);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setUrl(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-auto gap-1 px-1.5 py-0.5 text-xs" aria-label={`Get shareable link for invoice ${invoiceNumber}`}>
          <Link2 className="size-3.5" /> Share link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shareable link for {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Generates a link that downloads this invoice&apos;s PDF for 7 days — anyone with the link can use it, no
            GrowthOS account required, so only share it with someone who should have the file.
          </DialogDescription>
        </DialogHeader>

        {url ? (
          <div className="flex items-center gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy shareable link">
              <Copy className="size-4" />
            </Button>
          </div>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={handleGenerate} disabled={pending}>
              {pending ? "Generating..." : "Generate link"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
