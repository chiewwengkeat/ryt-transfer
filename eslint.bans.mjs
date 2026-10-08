import { readFileSync } from "node:fs";
import path from "node:path";

import { SOURCE_FILES } from "./eslint.boundaries.mjs";

const MSW_DEVICE_EXPORTS = [
  ...readFileSync(
    path.join(import.meta.dirname, "metro.msw-entry.mjs"),
    "utf8",
  ).matchAll(/^export \{ (\w+) \}/gm),
].map(([, name]) => name);

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
const screenCaptureOutsidePlatform = {
  group: ["expo-screen-capture", "expo-screen-capture/**"],
  message:
    "Block and allow screen capture through src/shared/platform/, whose one key they must share: under a second key, allowing capture leaves it blocked.",
};
const CONSOLE_OUTSIDE_OBSERVABILITY =
  "Report through src/shared/observability/, which redacts personal data before anything is logged.";
const TEST_ID_INSTEAD_OF_ACCESSIBLE_NAME =
  "Name the element for its users instead (accessibilityRole and accessibilityLabel): tests query by accessible name.";
const mswRootImport = {
  name: "msw",
  allowImportNames: MSW_DEVICE_EXPORTS,
  allowTypeImports: true,
  message: `On a device, msw is metro.msw-entry.mjs, which exposes only ${MSW_DEVICE_EXPORTS.join(", ")}: a catch-all passthrough would send real requests from a demo build.`,
};
const mswSubpathImport = {
  group: ["msw/*"],
  allowTypeImports: true,
  message: `On a device, msw is metro.msw-entry.mjs, which exposes only ${MSW_DEVICE_EXPORTS.join(", ")}: a subpath goes around it, and msw's own servers send an unmatched request to the real network.`,
};

export default [
  {
    files: ["src/**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "App code is TypeScript: rename this file to .ts or .tsx, the only files the slice boundaries and import bans check.",
        },
      ],
    },
  },
  {
    files: SOURCE_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message:
            "Import statically: the import bans and slice boundaries cannot follow a dynamic import().",
        },
        {
          selector:
            "CallExpression[callee.name='require']:not([arguments.0.type='Literal'])",
          message:
            "Pass require() a string literal: the import bans and slice boundaries cannot follow anything else.",
        },
        {
          selector: "TSImportType",
          message:
            "Use `import type`: the slice boundaries cannot follow an import() type.",
        },
        {
          selector: "JSXAttribute[name.name='testID']",
          message: TEST_ID_INSTEAD_OF_ACCESSIBLE_NAME,
        },
        {
          selector:
            "JSXSpreadAttribute > ObjectExpression > Property:matches([key.name='testID'], [key.value='testID'])",
          message: TEST_ID_INSTEAD_OF_ACCESSIBLE_NAME,
        },
        {
          selector:
            "CallExpression:matches([callee.name='createElement'], [callee.property.name='createElement']) > ObjectExpression > Property:matches([key.name='testID'], [key.value='testID'])",
          message: TEST_ID_INSTEAD_OF_ACCESSIBLE_NAME,
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "console", message: CONSOLE_OUTSIDE_OBSERVABILITY },
      ],
      "no-restricted-properties": [
        "error",
        ...["globalThis", "global", "window"].map((object) => ({
          object,
          property: "console",
          message: CONSOLE_OUTSIDE_OBSERVABILITY,
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            staticMocksImport,
            storageOutsidePlatform,
            storageAnywhere,
            screenCaptureOutsidePlatform,
          ],
        },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [mswRootImport], patterns: [mswSubpathImport] },
      ],
    },
  },
  {
    files: ["src/shared/observability/**"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
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
      "no-restricted-imports": [
        "error",
        { patterns: [storageAnywhere, screenCaptureOutsidePlatform] },
      ],
    },
  },
  {
    files: ["src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            storageOutsidePlatform,
            storageAnywhere,
            screenCaptureOutsidePlatform,
          ],
        },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [mswRootImport] },
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
];
