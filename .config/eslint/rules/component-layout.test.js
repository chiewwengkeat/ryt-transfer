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

test("component-layout: the reference shape imports -> Props -> component -> styles -> detail", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { StyleSheet, Text } from "react-native";',
      "",
      "interface Props {",
      "  amount: string;",
      "}",
      "export default function ModalConfirm({ amount }: Props) {",
      "  return <Text style={styles.main}>{ConfirmRows[0] + amount}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ main: { rowGap: 12 } });",
      "",
      'const ConfirmRows = ["recipient", "amount"] as const;',
    ].join("\n"),
  });
});

test("component-layout: a component with no Props, styles or detail passes", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { View } from "react-native";',
      "",
      "export default function Spacer() {",
      "  return <View />;",
      "}",
    ].join("\n"),
  });
});

test("component-layout: a value styles reads may sit between component and styles", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { StyleSheet, View } from "react-native";',
      "",
      "export default function Frame() {",
      "  return <View style={styles.main} />;",
      "}",
      "",
      "const FRAME_WIDTH = 372;",
      "",
      "const styles = StyleSheet.create({ main: { width: FRAME_WIDTH } });",
    ].join("\n"),
  });
});

test("component-layout: a memo() wrapper is recognised as the component", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "export default memo(function Chip({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "});",
    ].join("\n"),
  });
});

test("component-layout: a module with no default-exported component stays inert", () => {
  passes(layout, {
    filename: F,
    code: [
      "const X = 1;",
      "export function helper() {",
      "  return X;",
      "}",
    ].join("\n"),
  });
});

test("component-layout: a .ts file is not a component file", () => {
  passes(layout, { filename: F.replace(/\.tsx$/, ".ts"), code: DETAIL_ABOVE });
});

test("component-layout: a .test.tsx is not a component file", () => {
  passes(layout, {
    filename: F.replace(/\.tsx$/, ".test.tsx"),
    code: DETAIL_ABOVE,
  });
});

test("component-layout: a default-exported hook module is not a component file", () => {
  passes(layout, {
    filename: S + "/domains/approval/hooks/use-pin-entry/use-pin-entry.tsx",
    code: [
      'import { useState } from "react";',
      "",
      "const HOOK_DETAIL = 1;",
      "",
      "export default function usePinEntry() {",
      "  return useState(HOOK_DETAIL);",
      "}",
    ].join("\n"),
  });
});

test("component-layout: an exported Props keeps the above-component slot", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export interface Props {",
      "  label: string;",
      "}",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-layout: <ComponentName>Props keeps the same slot as bare Props", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "interface FieldDropdownProps {",
      "  label: string;",
      "}",
      "export default function FieldDropdown({ label }: FieldDropdownProps) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-layout: reports detail sitting above the component", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { StyleSheet, Text } from "react-native";',
      "",
      "interface Props {",
      "  amount: string;",
      "}",
      'const ConfirmRows = ["recipient"] as const;',
      "",
      "export default function ModalConfirm({ amount }: Props) {",
      "  return <Text style={styles.main}>{ConfirmRows[0] + amount}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ main: { rowGap: 12 } });",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("component-layout: fixes a blank line between Props and the component", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
    output: [
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "blankBeforeComponent" }],
  });
});

test("component-layout: closes the Props -> JSDoc gap and keeps the JSDoc attached", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "",
      "/** dismissal is deliberately inert */",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
    output: [
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "/** dismissal is deliberately inert */",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "blankBeforeComponent" }],
  });
});

test("component-layout: reports a type sitting between the component and styles", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { StyleSheet, Text } from "react-native";',
      "",
      "export default function Badge() {",
      "  return <Text style={styles.main}>x</Text>;",
      "}",
      "",
      'type Tone = "info" | "warn";',
      "",
      "const styles = StyleSheet.create({ main: { fontSize: 12 } });",
    ].join("\n"),
    errors: [{ messageId: "betweenComponentAndStyles" }],
  });
});

test("component-layout: reports a styles-referenced value declared below styles (TDZ)", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { StyleSheet, View } from "react-native";',
      "",
      "export default function Frame() {",
      "  return <View style={styles.main} />;",
      "}",
      "",
      "const styles = StyleSheet.create({ main: { width: FRAME_WIDTH } });",
      "",
      "const FRAME_WIDTH = 372;",
    ].join("\n"),
    errors: [{ messageId: "tdzBelowStyles" }],
  });
});

test("component-layout: reports an import that appears after code", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      'import { useState } from "react";',
      "export default function Label({ label }: Props) {",
      "  const [x] = useState(0);",
      "  return <Text>{label + x}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "importAfterCode" }],
  });
});

test("component-layout: reports Props declared below the component", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function Label({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
      "",
      "interface Props {",
      "  label: string;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "propsBelowComponent" }],
  });
});

test("component-layout: reports <ComponentName>Props declared below the component", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { Text } from "react-native";',
      "",
      "export default function FieldDropdown({ label }: FieldDropdownProps) {",
      "  return <Text>{label}</Text>;",
      "}",
      "",
      "interface FieldDropdownProps {",
      "  label: string;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "propsBelowComponent" }],
  });
});

test("component-layout: a forwardRef wrapper is policed like a bare declaration", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { forwardRef } from "react";',
      'import { Text } from "react-native";',
      "",
      "const DETAIL = 1;",
      "",
      "export default forwardRef(function Label() {",
      "  return <Text>{DETAIL}</Text>;",
      "});",
    ].join("\n"),
    errors: [{ messageId: "beforeComponent" }],
  });
});

test("component-layout: memo(Chip, comparator) resolves Chip, so ChipProps keeps its slot", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "interface ChipProps {",
      "  label: string;",
      "}",
      CHIP_COMPARATOR,
      "",
      "function Chip({ label }: ChipProps) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
  });
});

// Proves the file is still LINTED, not merely quiet: an inert file would pass
// this too, and inert is not what the name fix bought.
test("component-layout: memo(Chip, comparator) still reports ChipProps below the component", () => {
  reports(layout, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      CHIP_COMPARATOR,
      "",
      "interface ChipProps {",
      "  label: string;",
      "}",
      "",
      "function Chip({ label }: ChipProps) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
    errors: [{ messageId: "propsBelowComponent" }],
  });
});

test("component-layout: forwardRef(Label, comparator) resolves Label for LabelProps", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { forwardRef } from "react";',
      'import { Text } from "react-native";',
      "",
      "interface LabelProps {",
      "  label: string;",
      "}",
      "export default forwardRef(Label, (a: LabelProps) => a);",
      "",
      "function Label({ label }: LabelProps) {",
      "  return <Text>{label}</Text>;",
      "}",
    ].join("\n"),
  });
});

test("component-layout: a bare `interface Props` is unaffected by the comparator overload", () => {
  passes(layout, {
    filename: F,
    code: [
      'import { memo } from "react";',
      'import { Text } from "react-native";',
      "",
      "interface Props {",
      "  label: string;",
      "}",
      "export default memo(Chip, (a: Props, b: Props) => a.label === b.label);",
      "",
      "function Chip({ label }: Props) {",
      "  return <Text>{label}</Text>;",
      "}",
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

const DETAIL_ABOVE = [
  "const ABOVE = 1;",
  "export default function Fixture() {",
  "  return null;",
  "}",
].join("\n");

// The comparator overload: scanning for the first function argument returned the
// comparator, so the name came back empty and `{Component}Props` lost its slot.
const CHIP_COMPARATOR =
  "export default memo(Chip, (a: ChipProps, b: ChipProps) => a.label === b.label);";
