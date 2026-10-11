"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");
const componentFileHelpers = require("./no-component-file-helpers");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("no-component-file-helpers: the component with its Props, styles, constants, types and context passes", () => {
  passes(componentFileHelpers, {
    filename: F,
    code: [
      'import { createContext } from "react";',
      'import { StyleSheet, Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "export default function CardSummary({ label }: Props) {",
      "  const doubled = [label].map((l) => l + l);",
      "  return <Text style={styles.main}>{doubled}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ main: { flex: 1 } });",
      "",
      "const MAX_LINES = 2;",
      'const LABELS = ["a", "b"].map((x) => x.toUpperCase());',
      "const SummaryContext = createContext(MAX_LINES);",
      "type Row = { id: string };",
    ].join("\n"),
  });
});

test("no-component-file-helpers: a component declared above its default export passes", () => {
  passes(componentFileHelpers, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "function CardSummary() {",
      "  return <Text>x</Text>;",
      "}",
      "",
      "export default CardSummary;",
    ].join("\n"),
  });
});

test("no-component-file-helpers: a .tsx with no component export is left alone", () => {
  passes(componentFileHelpers, {
    filename: S + "/test/render/render-route.tsx",
    code: [
      "export function renderRoute(url: string) {",
      "  return mountAt(url);",
      "}",
      "",
      "function mountAt(url: string) {",
      "  return url;",
      "}",
    ].join("\n"),
  });
});

test("no-component-file-helpers: a test file is left alone", () => {
  passes(componentFileHelpers, {
    filename: S + "/screens/home/HomeScreen/tests/HomeScreen.test.tsx",
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function StandIn() {",
      "  return <Text>x</Text>;",
      "}",
      "",
      "function renderStandIn() {",
      "  return <StandIn />;",
      "}",
    ].join("\n"),
  });
});

test("no-component-file-helpers: a .ts module keeps its private functions", () => {
  passes(componentFileHelpers, {
    filename: S + "/domains/transfer/lib/format-amount/format-amount.ts",
    code: [
      "export default function Formatter() {",
      "  return pad(1);",
      "}",
      "",
      "function pad(n: number) {",
      "  return n;",
      "}",
    ].join("\n"),
  });
});

test("no-component-file-helpers: reports a helper component below the component", () => {
  reports(componentFileHelpers, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function CardSummary() {",
      "  return <IconChevron />;",
      "}",
      "",
      "function IconChevron() {",
      "  return <Text>›</Text>;",
      "}",
    ].join("\n"),
    errors: [
      {
        messageId: "helperBesideComponent",
        data: { kind: "Component", name: "IconChevron" },
      },
    ],
  });
});

test("no-component-file-helpers: reports a hook below the component", () => {
  reports(componentFileHelpers, {
    filename: F,
    code: [
      'import { useState } from "react";',
      'import { Text } from "react-native";',
      "",
      "export default function CardSummary() {",
      "  const today = useToday();",
      "  return <Text>{today}</Text>;",
      "}",
      "",
      "function useToday() {",
      "  return useState(0)[0];",
      "}",
    ].join("\n"),
    errors: [
      {
        messageId: "helperBesideComponent",
        data: { kind: "Hook", name: "useToday" },
      },
    ],
  });
});

test("no-component-file-helpers: reports a function value held in a constant", () => {
  reports(componentFileHelpers, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function CardSummary() {",
      "  return <Text>{formatLabel(1)}</Text>;",
      "}",
      "",
      "const formatLabel = (n: number) => String(n);",
    ].join("\n"),
    errors: [
      {
        messageId: "helperBesideComponent",
        data: { kind: "Function", name: "formatLabel" },
      },
    ],
  });
});

test("no-component-file-helpers: reports a memo-wrapped component held in a constant", () => {
  reports(componentFileHelpers, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "export default function CardSummary() {",
      "  return <RowLine />;",
      "}",
      "",
      "const RowLine = memo(function RowLine() {",
      "  return <Text>x</Text>;",
      "});",
    ].join("\n"),
    errors: [
      {
        messageId: "helperBesideComponent",
        data: { kind: "Component", name: "RowLine" },
      },
    ],
  });
});

test("no-component-file-helpers: reports an exported function above the component", () => {
  reports(componentFileHelpers, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export function formatLabel(n: number) {",
      "  return String(n);",
      "}",
      "",
      "export default function CardSummary() {",
      "  return <Text>{formatLabel(1)}</Text>;",
      "}",
    ].join("\n"),
    errors: [
      {
        messageId: "helperBesideComponent",
        data: { kind: "Function", name: "formatLabel" },
      },
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

const S = "/repo/src";
const F =
  S +
  "/screens/transfer/TransferReviewScreen/components/CardSummary/CardSummary.tsx";

function passes(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [testCase], invalid: [] });
}
function reports(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [], invalid: [testCase] });
}
