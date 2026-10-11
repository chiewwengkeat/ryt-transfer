"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");
const layout = require("./component-layout");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

// Each shape below puts DETAIL above the component and asserts beforeComponent: a
// clean pass could not tell "recognised" from "inert".
test("export shapes: `export const Foo = () => …` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export const Label = () => <Text>{DETAIL}</Text>;",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `export const Foo: React.FC = …` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { FC } from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export const Label: FC = () => <Text>{DETAIL}</Text>;",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `export default () => {}` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default () => <Text>{DETAIL}</Text>;",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

// The component's slot is its DECLARATION, not the re-export line — otherwise
// every statement above it, styles included, would read as "before the
// component" and the whole file would light up.
test("export shapes: `export default Foo` is recognised at its declaration", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { StyleSheet, Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "function Label() {",
      "  return <Text style={styles.text}>{DETAIL}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ text: { fontSize: 12 } });",
      "",
      "export default Label;",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `export { Foo as default }` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "function Label() {",
      "  return <Text>{DETAIL}</Text>;",
      "}",
      "",
      "export { Label as default };",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `React.memo(Foo)` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import React from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default React.memo(Chip);",
      "",
      "function Chip() {",
      "  return <Text>{DETAIL}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `memo(forwardRef(fn))` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { forwardRef, memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default memo(forwardRef(function Label() {",
      "  return <Text>{DETAIL}</Text>;",
      "}));",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: `class Foo extends React.Component` is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import React from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default class ViewChip extends React.Component {",
      "  render() {",
      "    return <Text>{DETAIL}</Text>;",
      "  }",
      "}",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: memo(Chip, named comparator) is recognised", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default memo(Chip, function areEqual(a: object, b: object) {",
      "  return a === b;",
      "});",
      "",
      "function Chip() {",
      "  return <Text>{DETAIL}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("export shapes: a lowercase `export const` is not a component", () => {
  passes(layout, {
    filename: F,
    code: [
      "const DETAIL = 1;",
      "",
      "export const withPinGuard = () => DETAIL;",
    ].join("\n"),
  });
});

// A class is a component only when it extends React's.
test("export shapes: a class extending BaseModel is not a component", () => {
  passes(layout, {
    filename: F,
    code: [
      'import BaseModel from "../BaseModel";',
      "",
      "const DETAIL = 1;",
      "",
      "export default class TransferRequestModel extends BaseModel {",
      "  id = DETAIL;",
      "}",
    ].join("\n"),
  });
});

test("export shapes: `export const Icon = makeIcon(…)` is a call result, not a component", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { makeIcon } from "./make-icon";',
      "",
      "const DETAIL = 1;",
      "",
      "export const IconChevron = makeIcon(<svg id={DETAIL} />);",
    ].join("\n"),
  });
});

test("export shapes: two named components are ambiguous and stay inert", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export const RowHeader = () => <Text>{DETAIL}</Text>;",
      "",
      "export const RowFooter = () => <Text>{DETAIL}</Text>;",
    ].join("\n"),
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
  "/screens/transfer/TransferReviewScreen/components/ModalConfirm/ModalConfirm.tsx";

function passes(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [testCase], invalid: [] });
}
function reports(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [], invalid: [testCase] });
}
