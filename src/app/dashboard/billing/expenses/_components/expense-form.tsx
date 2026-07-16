"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createExpenseEntry } from "../actions";

const CATEGORIES = ["MARKETING", "SALES", "OTHER"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("MARKETING");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createExpenseEntry({
        category,
        amount: Number(amount),
        incurredOn: new Date(incurredOn),
        description: description.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setAmount("");
      setDescription("");
      setIncurredOn(todayIso());
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Log expense
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Log expense</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Category" htmlFor="expense-category" required>
              <Select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount" htmlFor="expense-amount" required>
              <Input id="expense-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </FormField>
            <FormField label="Date incurred" htmlFor="expense-date" required>
              <Input id="expense-date" type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} required />
            </FormField>
          </div>
          <FormField label="Description" htmlFor="expense-description">
            <textarea
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending || !amount || Number(amount) <= 0}>
              {pending ? "Saving…" : "Save expense"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
