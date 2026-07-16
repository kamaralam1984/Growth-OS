"use client";

import { motion } from "framer-motion";
import { UserCircle } from "lucide-react";

import { EASES } from "@/animations";

export interface WarRoomHumanSeat {
  id: string;
  name: string | null;
  roleLabel: string;
  isYou: boolean;
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function HumanSeat({ human }: { human: WarRoomHumanSeat }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASES.outExpo }}
      className="glass-panel-strong flex w-56 shrink-0 flex-col gap-3 rounded-2xl border border-primary/20 p-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <span className="text-sm font-semibold">{initials(human.name)}</span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            {human.name ?? "Team member"}
            {human.isYou && <span className="ml-1 text-xs font-normal text-primary">(you)</span>}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <UserCircle className="size-3.5" /> {human.roleLabel}
          </p>
        </div>
      </div>
      <p className="min-h-[2.25rem] text-xs text-muted-foreground">Human seat at the table — real-time, no simulation.</p>
    </motion.div>
  );
}
