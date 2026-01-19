import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project overrides: keep CI green while iterating quickly.
  {
    rules: {
      // This repository currently uses `any` in a few API routes and SDK wrappers.
      // Prefer tightening types over time, but don't fail lint builds on it.
      "@typescript-eslint/no-explicit-any": "off",

      // Some flows intentionally kick off work when UI state changes.
      // This rule is helpful, but currently too noisy for this codebase.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
