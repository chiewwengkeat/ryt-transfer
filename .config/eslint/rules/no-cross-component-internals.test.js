"use strict";
// These cases need real TS/JSX parsing, so the parser require is top-level and
// unguarded: if it is missing the file fails to load and node:test reports it,
// which is what we want — a skipped suite would be a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { mkdtempSync, mkdirSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const { parser } = require("typescript-eslint");
const rule = require("./no-cross-component-internals");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("valid: importing a sibling component's own entry file", () => {
  passes({
    filename: LIMIT,
    code: 'import CardBalance from "../CardBalance/CardBalance";',
  });
});

test("valid: a component importing its own colocated helper", () => {
  passes({
    filename: BALANCE,
    code: 'import { fmt } from "./card-balance.helper";',
  });
});

test("valid: a subfolder reaching back up into its own component folder", () => {
  passes({
    filename: COMPONENTS + "/CardBalance/sub/deep.ts",
    code: 'import { fmt } from "../card-balance.helper";',
  });
});

test("valid: a nested component folder reaching up into its parent's helper", () => {
  passes({
    filename: COMPONENTS + "/CardBalance/Badge/badge.helper.ts",
    code: 'import { fmt } from "../card-balance.helper";',
  });
});

test("valid: re-exporting from inside the same folder", () => {
  passes({
    filename: BALANCE,
    code: 'export { fmt } from "./card-balance.helper";',
  });
});

test("valid: importing a folder that resolves to its index barrel", () => {
  passes({
    filename: LIMIT,
    code: 'import SectionBarrel from "../SectionBarrel";',
  });
});

test("valid: naming that index barrel explicitly", () => {
  passes({
    filename: LIMIT,
    code: 'import SectionBarrel from "../SectionBarrel/index";',
  });
});

test("valid: a nested component folder's own entry is public", () => {
  passes({
    filename: LIMIT,
    code: 'import Badge from "../CardBalance/Badge/Badge";',
  });
});

test("valid: a file in a directory that is not a component folder", () => {
  passes({
    filename: LIMIT,
    code: 'import { fmt } from "../../utils/format";',
  });
});

test("valid: limits.store.tsx does not make state/limits a component folder", () => {
  passes({
    filename: LIMIT,
    code: 'import { useLimits } from "../../state/limits/use-limits";',
  });
});

test("valid: a package import is never relative", () => {
  passes({
    filename: LIMIT,
    code: 'import { useQuery } from "@tanstack/react-query";',
  });
});

test("valid: an @/ alias to a sibling component's own entry file", () => {
  passes({
    filename: LIMIT,
    options: SRC_ALIAS,
    code: 'import CardBalance from "@/domains/account/components/CardBalance/CardBalance";',
  });
});

test("invalid: an @/ alias reaching a sibling component's internal", () => {
  reports({
    filename: LIMIT,
    options: SRC_ALIAS,
    code: 'import { fmt } from "@/domains/account/components/CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper.ts", "CardBalance"),
  });
});

test("valid: an alias the option does not map is left alone", () => {
  passes({
    filename: LIMIT,
    options: SRC_ALIAS,
    code: 'import { fmt } from "~/domains/account/components/CardBalance/card-balance.helper";',
  });
});

test("valid: a relative source that resolves to nothing on disk", () => {
  passes({
    filename: LIMIT,
    code: 'import { fmt } from "../CardBalance/does-not-exist";',
  });
});

test("valid: an asset import is outside the module extensions", () => {
  passes({
    filename: LIMIT,
    code: 'import "../CardBalance/card-balance.svg";',
  });
});

test("valid: a bare filename has no directory to compare against", () => {
  passes({
    filename: "CardLimit.tsx",
    code: 'import { fmt } from "../CardBalance/card-balance.helper";',
  });
});

test("probe: a sibling folder's entry file, judged from the path alone", () => {
  passes({
    filename: PROBE,
    code: 'import CardBalance from "../CardBalance/CardBalance";',
  });
});

test("probe: a bare folder import enters nothing", () => {
  passes({
    filename: PROBE,
    code: 'import CardBalance from "../CardBalance";',
  });
});

test("probe: an explicit index barrel", () => {
  passes({
    filename: PROBE,
    code: 'import CardBalance from "../CardBalance/index";',
  });
});

test("probe: reaching past the public face still reports with nothing on disk", () => {
  reports({
    filename: PROBE,
    code: 'import { fmt } from "../CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper", "CardBalance"),
  });
});

test("probe: with only the linted file on disk, a reach past the public face still reports", () => {
  reports({
    filename: ON_DISK_PROBE + "/src/__selftest__/Grid.tsx",
    code: 'import { fmt } from "../CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper", "CardBalance"),
  });
});

test("probe: with only the linted file on disk, a sibling's entry is allowed", () => {
  passes({
    filename: ON_DISK_PROBE + "/src/__selftest__/Grid.tsx",
    code: 'import CardBalance from "../CardBalance/CardBalance";',
  });
});

test("invalid: importing a sibling component's colocated helper", () => {
  reports({
    filename: LIMIT,
    code: 'import { fmt } from "../CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper.ts", "CardBalance"),
  });
});

test("invalid: importing a sibling component's .type.ts", () => {
  reports({
    filename: LIMIT,
    code: 'import { CardBalanceProps } from "../CardBalance/CardBalance.type";',
    errors: crossInto("CardBalance.type.ts", "CardBalance"),
  });
});

test("invalid: a type-only import is the same coupling", () => {
  reports({
    filename: LIMIT,
    code: 'import type { CardBalanceProps } from "../CardBalance/CardBalance.type";',
    errors: crossInto("CardBalance.type.ts", "CardBalance"),
  });
});

test("invalid: a parent component reaching into its own child's internals", () => {
  reports({
    filename: BALANCE,
    code: 'import { badge } from "./Badge/badge.helper";',
    errors: crossInto("badge.helper.ts", "Badge"),
  });
});

test("invalid: a nested component folder's internal, reached from outside", () => {
  reports({
    filename: LIMIT,
    code: 'import { badge } from "../CardBalance/Badge/badge.helper";',
    errors: crossInto("badge.helper.ts", "Badge"),
  });
});

test("invalid: a file in a sibling's subfolder is still that component's internal", () => {
  reports({
    filename: LIMIT,
    code: 'import { deep } from "../CardBalance/sub/deep";',
    errors: crossInto("deep.ts", "CardBalance"),
  });
});

test("invalid: a named re-export reaches in exactly as an import does", () => {
  reports({
    filename: LIMIT,
    code: 'export { fmt } from "../CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper.ts", "CardBalance"),
  });
});

test("invalid: export * from a sibling's internal", () => {
  reports({
    filename: LIMIT,
    code: 'export * from "../CardBalance/card-balance.helper";',
    errors: crossInto("card-balance.helper.ts", "CardBalance"),
  });
});

test("invalid: a barrel folder's internals are still internal", () => {
  reports({
    filename: LIMIT,
    code: 'import { fmt } from "../SectionBarrel/barrel.helper";',
    errors: crossInto("barrel.helper.ts", "SectionBarrel"),
  });
});

test("invalid: two reaches in one file report twice", () => {
  reports({
    filename: LIMIT,
    code: [
      'import { fmt } from "../CardBalance/card-balance.helper";',
      'import { badge } from "../CardBalance/Badge/badge.helper";',
    ].join("\n"),
    errors: [
      ...crossInto("card-balance.helper.ts", "CardBalance"),
      ...crossInto("badge.helper.ts", "Badge"),
    ],
  });
});

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

/** ⚠ A real directory tree: resolveModule and dirEntries return empty for a path
 * that does not exist, so a synthetic filename makes every case pass as valid with
 * no `invalid` case able to report. */
function tree(files) {
  const root = mkdtempSync(tmpdir() + "/fe-cross-internals-");
  for (const rel of files) {
    const full = root + "/" + rel;
    mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, "");
  }
  return root;
}

const ACCOUNT = "src/domains/account";
const ROOT = tree([
  `${ACCOUNT}/components/CardBalance/CardBalance.tsx`,
  `${ACCOUNT}/components/CardBalance/CardBalance.style.ts`,
  `${ACCOUNT}/components/CardBalance/CardBalance.type.ts`,
  `${ACCOUNT}/components/CardBalance/card-balance.helper.ts`,
  `${ACCOUNT}/components/CardBalance/sub/deep.ts`,
  `${ACCOUNT}/components/CardBalance/Badge/Badge.tsx`,
  `${ACCOUNT}/components/CardBalance/Badge/badge.helper.ts`,
  `${ACCOUNT}/components/CardLimit/CardLimit.tsx`,
  `${ACCOUNT}/components/SectionBarrel/SectionBarrel.tsx`,
  `${ACCOUNT}/components/SectionBarrel/index.ts`,
  `${ACCOUNT}/components/SectionBarrel/barrel.helper.ts`,
  `${ACCOUNT}/state/limits/limits.store.tsx`,
  `${ACCOUNT}/state/limits/use-limits.tsx`,
  `${ACCOUNT}/utils/format.ts`,
]);

const COMPONENTS = ROOT + "/" + ACCOUNT + "/components";
const LIMIT = COMPONENTS + "/CardLimit/CardLimit.tsx";
const BALANCE = COMPONENTS + "/CardBalance/CardBalance.tsx";
const crossInto = (target, owner) => [
  { messageId: "crossInternals", data: { target, owner } },
];

function passes(testCase) {
  ruleTester.run("no-cross-component-internals", rule, {
    valid: [testCase],
    invalid: [],
  });
}
function reports(testCase) {
  ruleTester.run("no-cross-component-internals", rule, {
    valid: [],
    invalid: [testCase],
  });
}

const SRC_ALIAS = [{ aliases: { "@/": ROOT + "/src" } }];

// A path never written to disk, as for an unsaved buffer or `--stdin`: the rule
// judges from the import path alone.
const PROBE = "/repo/src/__selftest__/Grid.tsx";

// Only the linted file exists on disk, so its own directory reads back while the
// import target stays absent.
const ON_DISK_PROBE = tree(["src/__selftest__/Grid.tsx"]);
