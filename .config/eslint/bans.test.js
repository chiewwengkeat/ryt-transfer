const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const { ESLint } = require("eslint");

const REPO_ROOT = path.join(__dirname, "..", "..");
// The type-aware parser lints only files on disk, so the cases go to a copy of the lint setup.
const LINT_SETUP = [
  ".config",
  "eslint.config.mjs",
  "package.json",
  "tsconfig.json",
];

const TEST_ID_BAN = {
  ruleId: "no-restricted-syntax",
  message: /accessibilityLabel/,
};
const MSW_BAN = {
  ruleId: "@typescript-eslint/no-restricted-imports",
  message: /metro\.msw-entry\.mjs/,
};
const SCREEN_CAPTURE_BAN = {
  ruleId: "no-restricted-imports",
  message: /whose one key they must share/,
};
const SCREEN_DIR = "src/screens/probe/ProbeScreen";
const VIEW_IMPORT = 'import { View } from "react-native";\n';
const componentReturning = (imports, element) =>
  `${imports}\nexport default function Probe() {\n  return ${element};\n}\n`;

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
];

let lintRoot;
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
