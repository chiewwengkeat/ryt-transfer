import path from "node:path";

import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import pluginQuery from "@tanstack/eslint-plugin-query";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import boundaries from "eslint-plugin-boundaries";
import expo from "eslint-plugin-expo";
import { importX } from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import reactHooks from "eslint-plugin-react-hooks";
import testingLibrary from "eslint-plugin-testing-library";
import globals from "globals";
import * as tseslint from "typescript-eslint";

const TSCONFIG_PATH = path.join(import.meta.dirname, "tsconfig.json");
const SOURCE_FILES = ["src/**/*.{ts,tsx}"];
const TEST_FILES = ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"];
const DOMAIN_TYPES = ["domain", "endpoint", "domain-component"];

const domainPublicFiles = [
  {
    element: {
      type: "endpoint",
      fileInternalPath: [
        "{{ to.element.captured.endpoint }}.ts",
        "{{ to.element.captured.endpoint }}.type.ts",
      ],
    },
  },
  {
    element: {
      type: "domain-component",
      fileInternalPath: "{{ to.element.captured.component }}.tsx",
    },
  },
  {
    element: {
      type: "domain",
      fileInternalPath: [
        "api/{{ to.element.captured.area }}.keys.ts",
        "hooks/*.ts",
      ],
    },
  },
];
const screenEntry = {
  element: {
    type: "screen",
    fileInternalPath: "{{ to.element.captured.screen }}Screen.tsx",
  },
};
const flowStateFiles = {
  element: { type: "screens-folder", fileInternalPath: "state/**" },
};
const translationFiles = {
  element: {
    types: { anyOf: ["screens-folder", "domain"] },
    fileInternalPath: "i18n/*.json",
  },
};
const sharedCode = { element: { type: "shared" } };

const sliceBoundaries = [
  {
    from: { element: { type: "app" } },
    allow: {
      to: [
        screenEntry,
        flowStateFiles,
        ...domainPublicFiles,
        sharedCode,
        { element: { type: "shell" } },
      ],
    },
  },
  {
    from: { element: { type: "shell" } },
    allow: {
      to: [
        screenEntry,
        flowStateFiles,
        translationFiles,
        ...domainPublicFiles,
        sharedCode,
        { element: { type: "mocks" } },
      ],
    },
  },
  {
    from: { element: { type: "screen" } },
    allow: {
      to: [
        {
          element: {
            type: "screens-folder",
            captured: { flow: "{{ from.element.captured.flow }}" },
          },
        },
        ...domainPublicFiles,
        sharedCode,
      ],
    },
  },
  {
    from: { element: { type: "screens-folder" } },
    allow: { to: [...domainPublicFiles, sharedCode] },
  },
  {
    from: { element: { types: { anyOf: DOMAIN_TYPES } } },
    allow: {
      to: [
        {
          element: {
            types: { anyOf: DOMAIN_TYPES },
            captured: { area: "{{ from.element.captured.area }}" },
          },
        },
        sharedCode,
      ],
    },
  },
  { from: { element: { type: "shared" } }, allow: { to: sharedCode } },
  {
    from: { element: { type: "mocks" } },
    allow: { to: [...domainPublicFiles, sharedCode] },
  },
  {
    from: { element: { type: "test" } },
    allow: { to: { element: { type: "*" } } },
  },
  {
    from: { file: { categories: "test" } },
    allow: { to: { element: { type: "test" } } },
  },
];

const staticMocksImport = {
  group: ["@/mocks", "@/mocks/**", "**/mocks", "**/mocks/**"],
  message:
    "Mock code reaches the app only through the shell's conditional require(); a static import ships it in production builds.",
};
const storageOutsidePlatform = {
  group: [
    "expo-secure-store",
    "expo-secure-store/**",
    "expo-sqlite",
    "expo-sqlite/**",
  ],
  message: "Storage goes through the wrappers in src/shared/platform/.",
};
const storageAnywhere = {
  group: [
    "@react-native-async-storage/**",
    "react-native-mmkv",
    "react-native-mmkv/**",
  ],
  message:
    "Use src/shared/platform/: secrets in secure storage, everything else in the kv-store.",
};

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
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [importX.flatConfigs.recommended, importX.flatConfigs.typescript],
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: TSCONFIG_PATH,
        }),
      ],
    },
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            ...TEST_FILES,
            "scripts/**",
            "eslint-rules/**",
            "*.config.{js,mjs,ts}",
          ],
        },
      ],
    },
  },
  {
    files: SOURCE_FILES,
    extends: [
      eslintReact.configs["recommended-type-checked"],
      eslintReact.configs["disable-dom"],
      reactHooks.configs.flat["recommended-latest"],
      pluginQuery.configs["flat/recommended"],
    ],
    plugins: { boundaries, expo },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app", partialMatch: false },
        { type: "shell", pattern: "src/shell", partialMatch: false },
        { type: "mocks", pattern: "src/mocks", partialMatch: false },
        { type: "test", pattern: "src/test", partialMatch: false },
        {
          type: "shared",
          pattern: "src/shared/*",
          partialMatch: false,
          capture: ["module"],
        },
        {
          type: "screen",
          pattern: "src/screens/*/*Screen",
          partialMatch: false,
          capture: ["flow", "screen"],
        },
        {
          type: "screens-folder",
          pattern: "src/screens/*",
          partialMatch: false,
          capture: ["flow"],
        },
        {
          type: "endpoint",
          pattern: "src/domains/*/api/*",
          partialMatch: false,
          capture: ["area", "endpoint"],
        },
        {
          type: "domain-component",
          pattern: "src/domains/*/components/*",
          partialMatch: false,
          capture: ["area", "component"],
        },
        {
          type: "domain",
          pattern: "src/domains/*",
          partialMatch: false,
          capture: ["area"],
        },
      ],
      "boundaries/files": [{ category: "test", pattern: "**/*.test.{ts,tsx}" }],
      // require() must count: it is the shell's one way into src/mocks.
      "boundaries/dependency-nodes": [
        "import",
        "export",
        "require",
        "dynamic-import",
      ],
      "boundaries/legacy-templates": false,
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: TSCONFIG_PATH },
      },
    },
    rules: {
      // eslint-plugin-react-hooks owns these; eslint-react ships its own copies.
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/use-memo": "off",
      "boundaries/dependencies": [
        "error",
        { default: "disallow", policies: sliceBoundaries },
      ],
      "boundaries/no-unknown-files": "error",
      "expo/no-dynamic-env-var": "error",
      "expo/no-env-var-destructuring": "error",
      "expo/use-dom-exports": "error",
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            staticMocksImport,
            storageOutsidePlatform,
            storageAnywhere,
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/observability/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["src/shared/platform/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [staticMocksImport, storageAnywhere] },
      ],
    },
  },
  {
    files: ["src/mocks/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [storageAnywhere] }],
    },
  },
  {
    files: ["src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [storageOutsidePlatform, storageAnywhere] },
      ],
    },
  },
  {
    files: ["src/shell/**"],
    rules: {
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: ["^@/mocks(/|$)"] },
      ],
    },
  },
  {
    files: TEST_FILES,
    extends: [
      jest.configs["flat/recommended"],
      testingLibrary.configs["flat/react"],
    ],
    settings: { jest: { version: 29 } },
  },
  prettier,
);
