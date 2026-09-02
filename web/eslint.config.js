import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// eslint-plugin-react / jsx-a11y are installed but pinned to the ESLint 8 API, so the
// React-specific and a11y checks that matter here are covered by the jsdom harnesses
// (scripts/a11y.mjs asserts alt text, accessible names, labels, heading order).
export default [
  { ignores: ["dist/**", ".smoke/**", "node_modules/**"] },
  {
    ...js.configs.recommended,
    files: ["src/**/*.{js,jsx}", "vite.config.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^React$" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-case-declarations": "off",
      "no-useless-escape": "off",
      "no-control-regex": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
