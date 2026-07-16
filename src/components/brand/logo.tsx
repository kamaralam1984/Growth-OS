import { cn } from "@/lib/utils";

import { LogoMark } from "./logo-mark";
import { Wordmark } from "./wordmark";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}

function Logo({ className, showWordmark = true, size = 28 }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} className="shrink-0" />
      {showWordmark ? <Wordmark /> : null}
    </span>
  );
}

export { Logo };
export default Logo;
