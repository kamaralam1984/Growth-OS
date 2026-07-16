"use client";

import { motion } from "framer-motion";

const BAR_COUNT = 5;

/**
 * A real status-driven animation, not fake audio — bars pulse only while
 * the agent's AgentStatus is genuinely a "busy" state (see BUSY_STATUSES in
 * agent-seat.tsx), so this reflects an actual in-flight Claude call, never a
 * decorative loop that runs regardless of what the agent is doing.
 */
export function VoiceWave({ active }: { active: boolean }) {
  return (
    <div className="flex h-4 items-end gap-0.5" aria-hidden>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          className="w-0.5 rounded-full bg-primary"
          initial={{ height: 3 }}
          animate={active ? { height: [3, 14, 5, 12, 3] } : { height: 3 }}
          transition={active ? { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}
