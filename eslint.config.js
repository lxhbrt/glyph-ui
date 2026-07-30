/**
 * ESLint flat config for Glyph (ESM, React 19 client, Node bridge).
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "node_modules/**",
      "client/dist/**",
      "coverage/**",
      "**/*.bak",
      "**/*.bak.*",
      "scripts/assets/**",
    ],
  },

  // —— Shared base ——
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Catch dead helpers (e.g. never-called buildPromptBlocks).
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          // React components / JSX identifiers
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },

  // —— React client ——
  {
    files: ["client/src/**/*.{js,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // Vite define from package.json + git (client/vite.config.js)
        __GLYPH_VERSION__: "readonly",
        __GLYPH_BUILD__: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      // We use prop-less presentational components often; prop-types optional.
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      // allow unused _props destructure
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // —— Node bridge / scripts / tests ——
  {
    files: ["server/**/*.js", "scripts/**/*.{js,mjs}", "tests/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
