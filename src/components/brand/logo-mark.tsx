import * as React from "react";

interface LogoMarkProps {
  className?: string;
  size?: number;
}

/**
 * Abstract growth-trajectory mark: three ascending, connected nodes (an
 * agent handing work off to the next, trending up and to the right) plus a
 * small satellite node orbiting the lead node — an AI workforce collaborating
 * around a shared goal, not a literal "K" or a stock circle/blob.
 */
function LogoMark({ className, size = 28 }: LogoMarkProps) {
  const gradientId = React.useId();
  const lineGradient = `${gradientId}-line`;
  const nodeGradient = `${gradientId}-node`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={lineGradient} x1="5" y1="26" x2="28" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-emerald-400)" />
          <stop offset="55%" stopColor="var(--color-blue-400)" />
          <stop offset="100%" stopColor="var(--color-amber-400)" />
        </linearGradient>
        <linearGradient id={nodeGradient} x1="5" y1="26" x2="28" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-emerald-400)" />
          <stop offset="100%" stopColor="var(--color-blue-400)" />
        </linearGradient>
      </defs>

      <path
        d="M6.5 25 15 18.5 24 9.5"
        stroke={`url(#${lineGradient})`}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 9.5 28.5 13.5"
        stroke={`url(#${lineGradient})`}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />

      <circle cx="24" cy="9.5" r="5" stroke={`url(#${nodeGradient})`} strokeWidth="1" opacity="0.3" />

      <circle cx="6.5" cy="25" r="2" fill={`url(#${nodeGradient})`} />
      <circle cx="15" cy="18.5" r="2.6" fill={`url(#${nodeGradient})`} />
      <circle cx="28.5" cy="13.5" r="1.5" fill={`url(#${nodeGradient})`} opacity="0.9" />
      <circle cx="24" cy="9.5" r="3.4" fill={`url(#${nodeGradient})`} />
    </svg>
  );
}

export { LogoMark };
export default LogoMark;
