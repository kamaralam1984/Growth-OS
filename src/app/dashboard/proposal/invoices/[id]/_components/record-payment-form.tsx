"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordInvoicePayment } from "../../../_lib/invoice-actions";

export function RecordPaymentForm({ invoiceId, balanceDue }: { invoiceId: string; balanceDue: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(balanceDue > 0 ? String(balanceDue) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordInvoicePayment(invoiceId, Number(amount));
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  if (balanceDue <= 0) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <CircleDollarSign className="size-4 text-muted-foreground" />
      <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
      <Button type="submit" size="sm" disabled={pending || !(Number(amount) > 0)}>
        {pending ? "Recording…" : "Record payment"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
