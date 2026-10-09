const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const { ESLint } = require("eslint");

// eslint-disable-next-line fe/file-layout -- read at load by the before hook, which node:test runs as it registers
const REPO_ROOT = path.join(__dirname, "..", "..");
// The type-aware parser lints only files on disk, so the cases go to a copy of the lint setup.
// eslint-disable-next-line fe/file-layout -- read at load by the before hook, which node:test runs as it registers
const LINT_SETUP = [
  ".config",
  "eslint.config.mjs",
  "package.json",
  "tsconfig.json",
];

// eslint-disable-next-line fe/file-layout -- read at load by CASES
const TEST_ID_BAN = {
  ruleId: "no-restricted-syntax",
  message: /accessibilityLabel/,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const MSW_BAN = {
  ruleId: "@typescript-eslint/no-restricted-imports",
  message: /metro\.msw-entry\.mjs/,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const SCREEN_CAPTURE_BAN = {
  ruleId: "no-restricted-imports",
  message: /whose one key they must share/,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const MOCKS_BAN = { ruleId: "no-restricted-imports", message: /^'@\/mocks\// };
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const DEMO_CONTRACT_BAN = {
  ruleId: "no-restricted-imports",
  message: /only the demo contract's types/,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const STORAGE_BAN = {
  ruleId: "no-restricted-imports",
  message: /wrappers in src\/shared\/platform/,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const PARENT_FOLDER_IMPORT_BAN = {
  ruleId: "no-restricted-imports",
  message: /outside it with @\//,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const PARENT_FOLDER_SYNTAX_BAN = {
  ruleId: "no-restricted-syntax",
  message: /outside it with @\//,
};
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const SCREEN_DIR = "src/screens/probe/ProbeScreen";
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const ROOT_DIR = "src/root/probe";
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const DEMO_CONTRACT = "@/mocks/demo-layer/demo-layer";
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const VIEW_IMPORT = 'import { View } from "react-native";\n';
// eslint-disable-next-line fe/file-layout -- read at load by CASES
const componentReturning = (imports, element) =>
  `${imports}\nexport default function Probe() {\n  return ${element};\n}\n`;

// eslint-disable-next-line fe/file-layout -- read at load by the before hook and the test loop
const CASES = [
  ...[
    ["a JSX attribute", true, "", '<View testID="probe" />'],
    [
      "an object literal spread into JSX",
      true,
      "",
      '<View {...{ testID: "probe" }} />',
    ],
    [
      "createElement's props",
      true,
      'import { createElement } from "react";\n',
      'createElement(View, { testID: "probe" })',
    ],
    [
      "React.createElement's props",
      true,
      'import React from "react";\n',
      'React.createElement(View, { testID: "probe" })',
    ],
    [
      "an object literal spread into JSX",
      false,
      "",
      '<View {...{ accessibilityLabel: "probe" }} />',
    ],
    [
      "createElement's props",
      false,
      'import { createElement } from "react";\n',
      'createElement(View, { accessibilityLabel: "probe" })',
    ],
    [
      "React.createElement's props",
      false,
      'import React from "react";\n',
      'React.createElement(View, { accessibilityLabel: "probe" })',
    ],
    [
      "an object literal spread into JSX, as a quoted key",
      true,
      "",
      '<View {...{ "testID": "probe" }} />',
    ],
    [
      "an object literal spread into JSX, as a computed string key",
      true,
      "",
      '<View {...{ ["testID"]: "probe" }} />',
    ],
    [
      "createElement's props, as a quoted key",
      true,
      'import { createElement } from "react";\n',
      'createElement(View, { "testID": "probe" })',
    ],
    [
      "an object literal spread into JSX, as a quoted key",
      false,
      "",
      '<View {...{ "accessibilityLabel": "probe" }} />',
    ],
    [
      "createElement's props, as a quoted key",
      false,
      'import { createElement } from "react";\n',
      'createElement(View, { "accessibilityLabel": "probe" })',
    ],
    [
      "an object literal spread into JSX, with testID as its value",
      false,
      "",
      '<View {...{ accessibilityLabel: "testID" }} />',
    ],
  ].map(([place, refused, imports, element], i) => ({
    title: `${refused ? "refuses testID" : "passes an accessible name"} in ${place}`,
    file: `${SCREEN_DIR}/test-id-${i}.tsx`,
    source: componentReturning(imports + VIEW_IMPORT, element),
    refused,
    ban: TEST_ID_BAN,
  })),
  ...[
    ["a screen", SCREEN_DIR],
    ["src/mocks/", "src/mocks"],
  ].flatMap(([where, dir]) =>
    [
      ['import { setupServer } from "msw/native";', "msw/native"],
      ['import { setupServer } from "msw/node";', "msw/node"],
      ['import { setupWorker } from "msw/browser";', "msw/browser"],
      ['import { http } from "msw/core/http";', "msw/core/http"],
      ['import * as experimental from "msw/experimental";', "msw/experimental"],
      [
        'export { setupServer } from "msw/native";',
        "a re-export of msw/native",
      ],
      ['import msw = require("msw/native");', "an import-equals of msw/native"],
      ['import { passthrough } from "msw";', "passthrough from msw"],
    ].map(([source, what], i) => ({
      title: `refuses ${what} in ${where}`,
      file: `${dir}/msw-${i}.ts`,
      source: `${source}\n`,
      refused: true,
      ban: MSW_BAN,
    })),
  ),
  {
    title: "passes msw's four device names and its types in src/mocks/",
    file: "src/mocks/msw-device.ts",
    source:
      'import { delay, getResponse, http, HttpResponse } from "msw";\nimport type { RequestHandler } from "msw";\nimport type { SetupServerApi } from "msw/node";\n\nexport type Probe = [RequestHandler, SetupServerApi];\nexport const probe = [delay, getResponse, http, HttpResponse];\n',
    refused: false,
    ban: MSW_BAN,
  },
  {
    title: "passes msw/node in src/test/",
    file: "src/test/msw-node.ts",
    source:
      'import { setupServer } from "msw/node";\n\nexport const probe = setupServer();\n',
    refused: false,
    ban: MSW_BAN,
  },
  ...[
    ["a screen", SCREEN_DIR, true],
    ["src/mocks/", "src/mocks", true],
    ["src/test/", "src/test", true],
    ["src/shared/platform/", "src/shared/platform", false],
  ].map(([where, dir, refused]) => ({
    title: `${refused ? "refuses" : "passes"} expo-screen-capture in ${where}`,
    file: `${dir}/screen-capture.ts`,
    source:
      'import { preventScreenCaptureAsync } from "expo-screen-capture";\n',
    refused,
    ban: SCREEN_CAPTURE_BAN,
  })),
  ...[
    [
      "refuses a value import of the demo contract in src/root/",
      `${ROOT_DIR}/demo-value.ts`,
      `import demoLayer from "${DEMO_CONTRACT}";`,
      true,
      DEMO_CONTRACT_BAN,
    ],
    [
      "passes a type import of the demo contract in src/root/",
      `${ROOT_DIR}/demo-type.ts`,
      `import type { DemoLayer } from "${DEMO_CONTRACT}";`,
      false,
      MOCKS_BAN,
    ],
    [
      "passes an inline type import of the demo contract in src/root/",
      `${ROOT_DIR}/demo-inline-type.ts`,
      `import { type DemoLayer } from "${DEMO_CONTRACT}";`,
      false,
      MOCKS_BAN,
    ],
    [
      "refuses a type import from elsewhere in src/mocks/ in src/root/",
      `${ROOT_DIR}/mocks-type.ts`,
      'import type { BankState } from "@/mocks/bank/state";',
      true,
      MOCKS_BAN,
    ],
    [
      "refuses a static src/mocks/ import in a test beside app code",
      `${SCREEN_DIR}/mocks.test.ts`,
      'import { readBank } from "@/mocks/bank/state";',
      true,
      MOCKS_BAN,
    ],
    [
      "passes a static src/mocks/ import in a .check.test file",
      `${SCREEN_DIR}/mocks.check.test.ts`,
      'import { readBank } from "@/mocks/bank/state";',
      false,
      MOCKS_BAN,
    ],
    [
      "passes a static src/mocks/ import in a .check.test file in src/root/",
      `${ROOT_DIR}/mocks.check.test.ts`,
      `import demoLayer from "${DEMO_CONTRACT}";`,
      false,
      MOCKS_BAN,
    ],
    [
      "refuses expo-secure-store in a .check.test file",
      `${SCREEN_DIR}/storage.check.test.ts`,
      'import * as SecureStore from "expo-secure-store";',
      true,
      STORAGE_BAN,
    ],
  ].map(([title, file, source, refused, ban]) => ({
    title,
    file,
    source: `${source}\n`,
    refused,
    ban,
  })),
  ...[
    ["a screen", `${SCREEN_DIR}/parent-folder-import.ts`],
    ["src/shared/platform/", "src/shared/platform/parent-folder-import.ts"],
    ["src/mocks/", "src/mocks/parent-folder-import.ts"],
    ["src/test/", "src/test/parent-folder-import.ts"],
    ["src/root/", `${ROOT_DIR}/parent-folder-import.ts`],
    ["a .check.test file", `${SCREEN_DIR}/parent-folder-import.check.test.ts`],
  ].map(([where, file]) => ({
    title: `refuses a ../ import in ${where}`,
    file,
    source: 'import { probe } from "../probe";\n',
    refused: true,
    ban: PARENT_FOLDER_IMPORT_BAN,
  })),
  ...[
    [
      'import type { Probe } from "../probe";',
      "a type import",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'export { probe } from "../probe";',
      "a re-export",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'import { probe } from "..";',
      "an import of the parent folder itself",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'import { probe } from "../../probe";',
      "an import two folders up",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'export const probe: unknown = require("../probe");',
      "require()",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
    ['jest.mock("../probe");', "jest.mock()", PARENT_FOLDER_SYNTAX_BAN],
    [
      'export const probe = jest.requireActual<unknown>("../probe");',
      "jest.requireActual() with a type argument",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
    [
      'export const probe = import("../probe");',
      "a dynamic import()",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
    [
      'import probe = require("../probe");',
      "an import-equals",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
    [
      'export type Probe = import("../probe").Probe;',
      "an import() type",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
  ].map(([source, what, ban], i) => ({
    title: `refuses a ../ path in ${what}`,
    file: `${SCREEN_DIR}/parent-folder-${i}.ts`,
    source: `${source}\n`,
    refused: true,
    ban,
  })),
  ...[
    [
      'import { probe } from "./probe";',
      "an import inside its folder",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'import { probe } from "@/shared/probe";',
      "an import through the alias",
      PARENT_FOLDER_IMPORT_BAN,
    ],
    [
      'jest.mock("./probe");',
      "jest.mock() inside its folder",
      PARENT_FOLDER_SYNTAX_BAN,
    ],
  ].map(([source, what, ban], i) => ({
    title: `passes ${what}`,
    file: `${SCREEN_DIR}/inside-folder-${i}.ts`,
    source: `${source}\n`,
    refused: false,
    ban,
  })),
];

// eslint-disable-next-line fe/file-layout -- read at load by the before hook, which node:test runs as it registers
let lintRoot;
// eslint-disable-next-line fe/file-layout -- filled by the before hook, which node:test runs as it registers
const messagesByFile = new Map();

before(async () => {
  lintRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eslint-bans-"));
  for (const entry of LINT_SETUP)
    fs.cpSync(path.join(REPO_ROOT, entry), path.join(lintRoot, entry), {
      recursive: true,
    });
  fs.symlinkSync(
    path.join(REPO_ROOT, "node_modules"),
    path.join(lintRoot, "node_modules"),
    "dir",
  );
  for (const { file, source } of CASES) {
    fs.mkdirSync(path.dirname(path.join(lintRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(lintRoot, file), source);
  }
  const results = await new ESLint({ cwd: lintRoot }).lintFiles(
    CASES.map(({ file }) => file),
  );
  for (const result of results)
    messagesByFile.set(
      path.relative(lintRoot, result.filePath),
      result.messages,
    );
});

after(() => {
  if (lintRoot) fs.rmSync(lintRoot, { recursive: true, force: true });
});

for (const { title, file, refused, ban } of CASES) {
  test(title, () => {
    const messages = messagesByFile.get(file);
    assert.deepEqual(
      messages.filter(({ fatal }) => fatal).map(({ message }) => message),
      [],
    );
    assert.equal(
      messages.some(
        ({ ruleId, message }) =>
          ruleId === ban.ruleId && ban.message.test(message),
      ),
      refused,
    );
  });
}
