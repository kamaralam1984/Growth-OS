import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Phase 20 (WCAG 2.2): eslint-config-next already registers the
  // "jsx-a11y" plugin itself (with only a modest rule subset enabled) — a
  // second `plugins: { "jsx-a11y": ... } }` entry errors ("Cannot redefine
  // plugin"), so only the RULES from jsxA11y.flatConfigs.recommended are
  // merged in here, layering the real, dedicated ruleset (alt-text,
  // aria-role validity, label/control association, etc.) on top of the
  // already-registered plugin instance. Enforced at lint time so a
  // regression is caught in CI, not just at the occasional manual
  // axe-core scan (scripts/a11y-audit.ts).
  { rules: jsxA11y.flatConfigs.recommended.rules },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
