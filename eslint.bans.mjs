import { SOURCE_FILES } from "./eslint.boundaries.mjs";

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
      ],
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
];
