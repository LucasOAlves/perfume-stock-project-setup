// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";

// Flat config shared by both workspaces. Angular-specific rules (component/template
// conventions) are scoped to apps/web only — see docs/decisions/ADR-008-cicd-and-lint-tooling.md
// for why ESLint (not Biome) was picked: angular-eslint only integrates with ESLint.
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.angular/**", "**/coverage/**", "**/node_modules/**"]
  },

  // Base TypeScript rules for every .ts file in the repo.
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // The dev-only OTP console sender (apps/api/src/modules/identity/otp-sender.ts,
      // ADR-004) logs on purpose — no reason to fight that project-wide.
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },

  // Angular component/service conventions — apps/web only.
  {
    files: ["apps/web/**/*.ts"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": ["error", { type: "attribute", prefix: "app", style: "camelCase" }],
      "@angular-eslint/component-selector": ["error", { type: "element", prefix: "app", style: "kebab-case" }],
      // Every component in this app consistently uses constructor injection (still a
      // fully valid Angular pattern) — enabling this would flag the whole existing
      // codebase for a style preference, not a bug. Revisit as a deliberate migration
      // later if the team wants to adopt inject(), not as a side effect of adding lint.
      "@angular-eslint/prefer-inject": "off"
    }
  },

  // Angular template rules for the split .html files (ADR: components over ~150 lines
  // get a separate template — see docs/architecture/frontend-conventions.md).
  {
    files: ["apps/web/**/*.html"],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility]
  }
);
