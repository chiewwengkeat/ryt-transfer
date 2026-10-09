"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Linter, RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

const layout = require("./file-layout");

// RuleTester's own describe/it would catch a failed case and leave the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("file-layout: a module opens with its exports, its private helpers last", () => {
  passes({
    filename: MODULE_FILE,
    code: [
      'import { formatMoney } from "@/shared/lib/money/money";',
      "",
      "export function formatTotal(amount: number) {",
      "  return formatMoney(roundDown(amount));",
      "}",
      "",
      "function roundDown(amount: number) {",
      "  return Math.floor(amount);",
      "}",
    ].join("\n"),
  });
});

test("file-layout: reports each private declaration above an export, naming it", () => {
  reports({
    filename: MODULE_FILE,
    code: [
      "const ROUNDING = 100;",
      "function roundDown(amount: number) {",
      "  return Math.floor(amount / ROUNDING) * ROUNDING;",
      "}",
      "export function formatTotal(amount: number) {",
      "  return String(roundDown(amount));",
      "}",
    ].join("\n"),
    errors: [
      { messageId: "privateBeforeExport", data: { name: "ROUNDING" } },
      { messageId: "privateBeforeExport", data: { name: "roundDown" } },
    ],
  });
});

test("file-layout: reports a private type above an exported type", () => {
  reports({
    filename: MODULE_FILE,
    code: [
      "type Cents = number;",
      "export interface Total {",
      "  amount: Cents;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "privateBeforeExport", data: { name: "Cents" } }],
  });
});

test("file-layout: a declaration an export list or a default export names is an export", () => {
  passes({
    filename: MODULE_FILE,
    code: [
      'const totalLabel = "Total";',
      "function formatTotal() {",
      "  return totalLabel;",
      "}",
      "export { formatTotal };",
      "export default totalLabel;",
      "function roundDown() {}",
    ].join("\n"),
  });
  reports({
    filename: MODULE_FILE,
    code: [
      "function roundDown() {}",
      "function formatTotal() {",
      "  return roundDown();",
      "}",
      "export { formatTotal };",
    ].join("\n"),
    errors: [{ messageId: "privateBeforeExport", data: { name: "roundDown" } }],
  });
});

test("file-layout: a re-export is an export, and an empty export list is not", () => {
  reports({
    filename: MODULE_FILE,
    code: [
      "const ROUNDING = 100;",
      'export { formatMoney } from "@/shared/lib/money/money";',
      'export * from "./total.type";',
    ].join("\n"),
    errors: [{ messageId: "privateBeforeExport", data: { name: "ROUNDING" } }],
  });
  reports({
    filename: MODULE_FILE,
    code: ["function setUp() {}", "setUp();", "export {};"].join("\n"),
    errors: [{ messageId: "helperBeforeMain", data: { name: "setUp" } }],
  });
});

test("file-layout: a CommonJS module that assigns module.exports above its helpers passes", () => {
  passes({
    filename: RULE_FILE,
    code: [
      'const fs = require("node:fs");',
      'const { join } = require("node:path");',
      'const helpers = require("./_paths").default;',
      "",
      'module.exports = { meta: { type: "problem" }, create };',
      "",
      "function create() {",
      "  return readRules();",
      "}",
      "function readRules() {",
      '  return fs.readdirSync(join(".", "rules"));',
      "}",
    ].join("\n"),
  });
});

test("file-layout: reports a helper above module.exports", () => {
  reports({
    filename: RULE_FILE,
    code: [
      'const { join } = require("node:path");',
      "",
      "function readRules() {",
      '  return join(".", "rules");',
      "}",
      "",
      "module.exports = {",
      "  create() {",
      "    return readRules();",
      "  },",
      "};",
    ].join("\n"),
    errors: [{ messageId: "privateBeforeExport", data: { name: "readRules" } }],
  });
});

test("file-layout: a declaration module.exports or exports names is an export", () => {
  passes({
    filename: RULE_FILE,
    code: [
      "function readImportGraph() {",
      "  return new Map();",
      "}",
      "const listModules = () => [];",
      "exports.readImportGraph = readImportGraph;",
      "module.exports.listModules = listModules;",
      "module.exports = { readImportGraph, graphOf: listModules };",
    ].join("\n"),
  });
});

test("file-layout: an import-equals require is an import, not a helper", () => {
  passes({
    filename: MODULE_FILE,
    code: [
      'import fs = require("node:fs");',
      "",
      "export function readTotal() {",
      '  return fs.readFileSync("total", "utf8");',
      "}",
    ].join("\n"),
  });
});

test("file-layout: a test file opens with its setup and tests, its helpers last", () => {
  passes({
    filename: SCREEN_TEST_FILE,
    code: [
      'import { renderRoute } from "@/test/render-route";',
      "",
      'jest.mock("@/shared/platform/haptics");',
      "",
      "beforeEach(() => {",
      "  jest.useFakeTimers();",
      "});",
      "",
      'it("shows the total", async () => {',
      "  await renderRoute(TOTAL_URL);",
      '  expect(readTotal()).toBe("1");',
      "});",
      "",
      'const TOTAL_URL = "/transfer";',
      "",
      "function readTotal() {",
      '  return "1";',
      "}",
    ].join("\n"),
  });
});

test("file-layout: reports a helper above a test and setup below the first test", () => {
  reports({
    filename: SCREEN_TEST_FILE,
    code: [
      'const TOTAL_URL = "/transfer";',
      'it("shows the total", () => {',
      '  expect(TOTAL_URL).toBe("/transfer");',
      "});",
      "afterEach(() => {",
      "  jest.useRealTimers();",
      "});",
    ].join("\n"),
    errors: [
      { messageId: "helperBeforeTests", data: { name: "TOTAL_URL" } },
      { messageId: "setupAfterTests" },
    ],
  });
});

test("file-layout: an .each, .skip, .concurrent or .failing chain, scenarioTest and a loop of tests are tests", () => {
  for (const firstTest of [
    'it.each([1, 2])("rounds %i", (n) => expect(n).toBeGreaterThan(0));',
    'describe.skip.each([[1]])("table %i", () => {});',
    'test.concurrent.failing("flaky", async () => {});',
    'scenarioTest("transfer.offline", async () => {});',
    "for (const n of [1, 2]) {\n  it(`rounds ${n}`, () => {});\n}",
  ])
    reports({
      filename: SCREEN_TEST_FILE,
      code: `${firstTest}\njest.useRealTimers();`,
      errors: [{ messageId: "setupAfterTests" }],
    });
});

test("file-layout: a RuleTester's run(…) at the top level is a test, and a disable line keeps its tester above it", () => {
  const ruleTesterFile = (testerLines) =>
    [
      'const { RuleTester } = require("eslint");',
      'const rule = require("./file-layout");',
      "",
      "RuleTester.describe = (_name, fn) => fn();",
      ...testerLines,
      'ruleTester.run("file-layout", rule, { valid: [], invalid: [] });',
    ].join("\n");
  reports({
    filename: RULE_TEST_FILE,
    code: ruleTesterFile(["const ruleTester = new RuleTester();"]).concat(
      "\nRuleTester.it = (_name, fn) => fn();",
    ),
    errors: [
      { messageId: "helperBeforeTests", data: { name: "ruleTester" } },
      { messageId: "setupAfterTests" },
    ],
  });
  assert.deepEqual(
    reportsWithTheRuleOn(
      ruleTesterFile([
        "// eslint-disable-next-line fe/file-layout -- read at load by ruleTester.run",
        "const ruleTester = new RuleTester();",
      ]),
      RULE_TEST_FILE,
    ),
    [],
  );
});

test("file-layout: a node:test file opens with its tests, its helpers last", () => {
  const nodeTestFile = (body) =>
    [
      'const assert = require("node:assert/strict");',
      'const { test } = require("node:test");',
      "",
      ...body,
    ].join("\n");
  const graphTest = [
    'test("reads the graph", () => {',
    "  assert.equal(readGraph().size, 0);",
    "});",
  ];
  const graphHelper = ["function readGraph() {", "  return new Map();", "}"];
  passes({
    filename: SCRIPT_TEST_FILE,
    code: nodeTestFile([...graphTest, ...graphHelper]),
  });
  reports({
    filename: SCRIPT_TEST_FILE,
    code: nodeTestFile([...graphHelper, ...graphTest]),
    errors: [{ messageId: "helperBeforeTests", data: { name: "readGraph" } }],
  });
});

test("file-layout: a script opens with its run statements, its helpers last", () => {
  passes({
    filename: SCRIPT_FILE,
    code: [
      'const { spawnSync } = require("node:child_process");',
      "",
      "process.exitCode = runGitStatus();",
      "",
      "function runGitStatus() {",
      '  return spawnSync("git", ["status"]).status;',
      "}",
    ].join("\n"),
  });
});

test("file-layout: reports a helper above the script's first run statement, past a use strict directive", () => {
  reports({
    filename: SCRIPT_FILE,
    code: [
      '"use strict";',
      "function runGitStatus() {",
      "  return 0;",
      "}",
      "process.exitCode = runGitStatus();",
    ].join("\n"),
    errors: [{ messageId: "helperBeforeMain", data: { name: "runGitStatus" } }],
  });
});

test("file-layout: a disable line keeps a value the file reads at load above its reader", () => {
  const limitModule = (disableLines) =>
    [
      ...disableLines,
      "const LIMIT = 5000.4;",
      "export const ROUNDED_LIMIT = Math.round(LIMIT);",
    ].join("\n");
  assert.deepEqual(reportsWithTheRuleOn(limitModule([]), MODULE_FILE), [
    "privateBeforeExport",
  ]);
  assert.deepEqual(
    reportsWithTheRuleOn(
      limitModule([
        "// eslint-disable-next-line fe/file-layout -- read at load by ROUNDED_LIMIT",
      ]),
      MODULE_FILE,
    ),
    [],
  );
});

test("file-layout: skips a component file, a route and a declaration file", () => {
  passes({
    filename: `${SRC}/shared/ui/TextTotal/TextTotal.tsx`,
    code: [
      'import { Text } from "react-native";',
      "",
      'const LABEL = "Total";',
      "",
      "export default function TextTotal() {",
      "  return <Text>{LABEL}</Text>;",
      "}",
    ].join("\n"),
  });
  passes({
    filename: `${SRC}/app/+native-intent.tsx`,
    code: [
      'const LINKABLE_PATHS = ["/transfer"];',
      "",
      "export function redirectSystemPath({ path }: { path: string }) {",
      '  return LINKABLE_PATHS.includes(path) ? path : "/";',
      "}",
    ].join("\n"),
  });
  passes({
    filename: "/repo/expo-env.d.ts",
    code: "type Variant = string;\nexport type AppVariant = Variant;",
  });
});

test("file-layout: checks a .tsx file with no component as a module", () => {
  reports({
    filename: `${SRC}/test/render-transfer.tsx`,
    code: [
      'const TRANSFER_URL = "/transfer";',
      "export function renderTransfer() {",
      "  return TRANSFER_URL;",
      "}",
    ].join("\n"),
    errors: [
      { messageId: "privateBeforeExport", data: { name: "TRANSFER_URL" } },
    ],
  });
});

const SRC = "/repo/src";
const MODULE_FILE = `${SRC}/domains/transfer/lib/total/total.ts`;
const SCREEN_TEST_FILE = `${SRC}/screens/transfer/TransferAmountScreen/TransferAmountScreen.test.tsx`;
const RULE_FILE = "/repo/.config/eslint/rules/total-rule.js";
const RULE_TEST_FILE = "/repo/.config/eslint/rules/total-rule.test.js";
const SCRIPT_FILE = "/repo/scripts/git-status.js";
const SCRIPT_TEST_FILE = "/repo/scripts/import-graph.test.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

function passes(testCase) {
  ruleTester.run("file-layout", layout, { valid: [testCase], invalid: [] });
}

function reports(testCase) {
  ruleTester.run("file-layout", layout, { valid: [], invalid: [testCase] });
}

// RuleTester names the rule under test for itself, so only a Linter can honour `fe/file-layout`.
function reportsWithTheRuleOn(code, filename) {
  return new Linter({ cwd: "/repo" })
    .verify(
      code,
      [
        {
          files: ["**/*.{js,ts}"],
          plugins: { fe: { rules: { "file-layout": layout } } },
          languageOptions: { parser },
          rules: { "fe/file-layout": "error" },
        },
      ],
      filename,
    )
    .map((message) => message.messageId ?? message.message);
}
