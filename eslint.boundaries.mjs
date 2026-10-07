import path from "node:path";

import boundaries from "eslint-plugin-boundaries";

export const SOURCE_FILES = ["src/**/*.{ts,tsx}"];

const TSCONFIG_PATH = path.join(import.meta.dirname, "tsconfig.json");
const DOMAIN_TYPES = ["domain", "endpoint", "domain-component"];

const sliceElements = [
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
];

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

export default [
  {
    files: SOURCE_FILES,
    plugins: { boundaries },
    settings: {
      "boundaries/elements": sliceElements,
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
      "boundaries/dependencies": [
        "error",
        { default: "disallow", policies: sliceBoundaries },
      ],
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/no-unknown-files": "error",
    },
  },
];
