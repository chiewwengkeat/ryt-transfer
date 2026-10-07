const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const { ESLint } = require("eslint");

const REPO_ROOT = path.join(__dirname, "..");
// The type-aware parser lints only files on disk, so the cases go to a copy of the lint setup.
const LINT_SETUP = [
  "eslint-rules",
  "eslint.bans.mjs",
  "eslint.boundaries.mjs",
  "eslint.config.mjs",
  "metro.msw-entry.mjs",
  "package.json",
  "test-files.js",
  "tsconfig.json",
];

const TEST_ID_BAN = {
  ruleId: "no-restricted-syntax",
  message: /accessibilityLabel/,
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
  ].map(([place, refused, imports, element], i) => ({
    title: `${refused ? "refuses testID" : "passes an accessible name"} in ${place}`,
    file: `${SCREEN_DIR}/test-id-${i}.tsx`,
    source: componentReturning(imports + VIEW_IMPORT, element),
    refused,
    ban: TEST_ID_BAN,
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
