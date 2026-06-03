import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules",
      ".aws-sam",
      "build",
      "dist",
      "dotenv",
      "coverage",
      "package-lock.json",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaVersion: 2022,
      parserOptions: {
        ecmaFeatures: {
          impliedStrict: true,
        },
      },
      globals: {
        ...globals.node,
        sinon: "readonly",
        expect: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-console": 2,
      "padding-line-between-statements": [
        "error",
        { blankLine: "any", prev: "*", next: "*" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  prettierRecommended,
];
