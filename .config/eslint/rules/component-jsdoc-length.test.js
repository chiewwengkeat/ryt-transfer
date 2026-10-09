"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

const jsdocLength = require("./component-jsdoc-length");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("component-jsdoc-length: a 4-line JSDoc sits at the default cap", () => {
  passes(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/**",
      " * Must-answer prompt; back/tap-outside are deliberately inert.",
      " * Step state is per-invocation only.",
      " */",
      "export default function ModalConfirm() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-jsdoc-length: a component with no JSDoc passes", () => {
  passes(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function Plain() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-jsdoc-length: a plain block comment is not JSDoc and is ignored", () => {
  passes(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/*",
      " line 1",
      " line 2",
      " line 3",
      " line 4",
      " */",
      "export default function Plain() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-jsdoc-length: maxLines 6 accepts a 6-line JSDoc", () => {
  passes(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/**",
      " * line 1",
      " * line 2",
      " * line 3",
      " * line 4",
      " */",
      "export default function Plain() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
    options: [{ maxLines: 6 }],
  });
});

test("component-jsdoc-length: reports a JSDoc over the default cap", () => {
  reports(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/**",
      " * Must-answer confirmation prompt (review step only).",
      " * Back/tap-outside are inert.",
      " * Step state is local, never the persisted store.",
      " */",
      "export default function ModalConfirm() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "tooLong" }],
  });
});

test("component-jsdoc-length: reaches `export const Foo`", () => {
  reports(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/**",
      " * line 1",
      " * line 2",
      " * line 3",
      " * line 4",
      " */",
      "export const Plain = () => <Text>x</Text>;",
    ].join("\n"),
    errors: [{ messageId: "tooLong" }],
  });
});

test("component-jsdoc-length: maxLines 2 tightens the cap", () => {
  reports(jsdocLength, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "/**",
      " * Must-answer prompt.",
      " */",
      "export default function ModalConfirm() {",
      "  return <Text>x</Text>;",
      "}",
    ].join("\n"),
    options: [{ maxLines: 2 }],
    errors: [{ messageId: "tooLong" }],
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
