"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LineItemRow {
  description: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
}

export interface LineItemsEditorProps {
  items: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
  showDiscount?: boolean;
}

/** Reused by the Quotation and Invoice generator forms — dynamic add/remove line-item rows (description/quantity/rate[/discount]). */
export function LineItemsEditor({ items, onChange, showDiscount }: LineItemsEditorProps) {
  function updateItem(index: number, patch: Partial<LineItemRow>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([...items, { description: "", quantity: "1", rate: "0", discountPercent: "" }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`grid gap-2 text-xs font-medium text-muted-foreground ${showDiscount ? "grid-cols-[1fr_80px_100px_90px_32px]" : "grid-cols-[1fr_80px_100px_32px]"}`}>
        <span>Description</span>
        <span>Qty</span>
        <span>Rate</span>
        {showDiscount && <span>Disc. %</span>}
        <span />
      </div>
      {items.map((item, index) => (
        <div key={index} className={`grid gap-2 ${showDiscount ? "grid-cols-[1fr_80px_100px_90px_32px]" : "grid-cols-[1fr_80px_100px_32px]"}`}>
          <Input value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Item description" />
          <Input type="number" min={0} value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} />
          <Input type="number" min={0} value={item.rate} onChange={(e) => updateItem(index, { rate: e.target.value })} />
          {showDiscount && <Input type="number" min={0} max={100} value={item.discountPercent ?? ""} onChange={(e) => updateItem(index, { discountPercent: e.target.value })} />}
          <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={items.length <= 1} aria-label="Remove line item">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
        <Plus className="size-3.5" /> Add line item
      </Button>
    </div>
  );
}
