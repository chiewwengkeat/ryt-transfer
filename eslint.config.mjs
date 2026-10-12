/* eslint-disable fe/file-layout -- a config file built at load */
import eslintReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import prettier from "eslint-config-prettier";
import expo from "eslint-plugin-expo";
import { importX } from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import reactHooks from "eslint-plugin-react-hooks";
import testingLibrary from "eslint-plugin-testing-library";
import { defineConfig } from "eslint/config";
import globals from "globals";
import path from "node:path";
import * as tseslint from "typescript-eslint";
import appCodeBans from "./.config/eslint/bans.mjs";
import sliceBoundaries, { SOURCE_FILES } from "./.config/eslint/boundaries.mjs";
import diskChanges from "./.config/eslint/disk-changes.js";
import fe from "./.config/eslint/rules/index.js";
import { TEST_FILES, TEST_HELPER_FILES } from "./.config/test-files.js";

const TSCONFIG_PATH = path.join(import.meta.dirname, "tsconfig.json");
const TEST_CODE_FILES = [...TEST_FILES, ...TEST_HELPER_FILES];

export default defineConfig(
  {
    ignores: [
      "node_modules/",
      ".expo/",
      "dist/",
      "ios/",
      "android/",
      "coverage/",
      ".husky/",
      "expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  // Babel compiles const, let and enum to var here, so a value read before its definition is a
  // silent undefined, never a TDZ error. A read inside a function body runs later, and is allowed.
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-use-before-define": [
        "error",
        {
          functions: false,
          classes: true,
          variables: false,
          allowNamedExports: false,
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parser: diskChanges.typescriptParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-use-before-define": [
        "error",
        {
          functions: false,
          classes: true,
          variables: false,
          enums: false,
          typedefs: false,
          ignoreTypeReferences: true,
          allowNamedExports: false,
        },
      ],
    },
  },
  {
    files: SOURCE_FILES,
    ignores: TEST_CODE_FILES,
    // App code calls a promise un-awaited with no `void`; tests keep it to catch an un-awaited press.
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "no-void": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [importX.flatConfigs.recommended, importX.flatConfigs.typescript],
    settings: {
      "import-x/resolver-next": [
        diskChanges.typescriptImportResolver({
          alwaysTryTypes: true,
          project: TSCONFIG_PATH,
        }),
      ],
      "import-x/cache": diskChanges.importCache,
    },
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            ...TEST_CODE_FILES,
            "scripts/**",
            ".config/**",
            "*.config.{js,mjs,ts}",
          ],
        },
      ],
    },
  },
  {
    files: [".config/metro.msw-entry.mjs"],
    // msw-core/* exists only inside Metro, which .config/metro.js points at msw's own modules.
    rules: { "import-x/no-unresolved": "off" },
  },
  {
    files: SOURCE_FILES,
    extends: [
      eslintReact.configs["recommended-type-checked"],
      eslintReact.configs["disable-dom"],
      reactHooks.configs.flat["recommended-latest"],
      pluginQuery.configs["flat/recommended"],
    ],
    plugins: { expo },
    rules: {
      // eslint-plugin-react-hooks owns these; eslint-react ships its own copies.
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/use-memo": "off",
      "expo/no-dynamic-env-var": "error",
      "expo/no-env-var-destructuring": "error",
      "expo/use-dom-exports": "error",
    },
  },
  ...sliceBoundaries,
  ...appCodeBans,
  {
    files: TEST_CODE_FILES,
    extends: [
      jest.configs["flat/recommended"],
      testingLibrary.configs["flat/react"],
    ],
    settings: { jest: { version: 29 } },
    rules: {
      // These assume the DOM library's sync events, and await-async-events' fixer crashes
      // require-await; no-floating-promises catches an un-awaited event from its types.
      "testing-library/await-async-events": "off",
      "testing-library/no-await-sync-events": "off",
      "testing-library/no-test-id-queries": "error",
    },
  },
  {
    files: SOURCE_FILES,
    plugins: { fe },
    rules: {
      "fe/component-folder-identity": "error",
      "fe/component-jsdoc-length": "error",
      "fe/component-layout": "error",
      "fe/component-own-folder": "error",
      "fe/component-type-prefix": "error",
      "fe/hook-file-kebab-case": "error",
      "fe/hook-filename-matches-export": "error",
      "fe/no-component-fetch-hooks": "error",
      "fe/no-cross-component-internals": [
        "error",
        { aliases: { "@/": path.join(import.meta.dirname, "src") } },
      ],
      "fe/sibling-basename-tracks-folder": "error",
      "fe/singular-role-suffix": "error",
      "fe/style-key-names": "error",
    },
  },
  {
    files: SOURCE_FILES,
    ignores: TEST_CODE_FILES,
    plugins: { fe },
    rules: {
      "fe/no-component-file-helpers": "error",
      "no-nested-ternary": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ignores: ["src/app/**", "**/*.d.ts"],
    plugins: { fe },
    rules: { "fe/file-layout": "error" },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: { fe },
    rules: { "fe/no-blank-line-between-imports": "error" },
  },
  {
    files: [...TEST_FILES, ".config/**/*.test.js", "scripts/*.test.js"],
    rules: {
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: false, skipComments: false },
      ],
    },
  },
  prettier,
);
