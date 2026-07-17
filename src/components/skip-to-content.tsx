/**
 * Real WCAG 2.4.1 "Bypass Blocks" skip link — invisible until keyboard-
 * focused (Tab from the very top of the page), then jumps straight past
 * the header/sidebar/nav chrome to `#main-content` (set on every shell's
 * <main> — see dashboard/board/admin/portal layouts). Every real page in
 * this app renders under the root layout, so mounting this once here
 * covers all of them.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-elevated"
    >
      Skip to main content
    </a>
  );
}
