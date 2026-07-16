import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
}

/** "KVL" in heavy weight + "GrowthOS" in a lighter weight right after it. */
function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={cn("font-sans tracking-tight", className)}>
      <span className="font-bold text-gradient-brand">KVL</span>{" "}
      <span className="font-normal text-muted-foreground">GrowthOS</span>
    </span>
  );
}

export { Wordmark };
export default Wordmark;
