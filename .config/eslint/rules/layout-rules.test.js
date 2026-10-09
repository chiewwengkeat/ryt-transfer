"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

const layout = require("./component-layout");
const jsdocLength = require("./component-jsdoc-length");
// component-type-prefix's filename-only cases live in rules.test.js; the ones that
// need the AST to find the exported component live here.
const typePrefix = require("./component-type-prefix");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

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
      "  return <Text style={styles.item}>{ConfirmRows[0] + amount}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ item: { rowGap: 12 } });",
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
      "  return <View style={styles.frame} />;",
      "}",
      "",
      "const FRAME_WIDTH = 372;",
      "",
      "const styles = StyleSheet.create({ frame: { width: FRAME_WIDTH } });",
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

const DETAIL_ABOVE = [
  "const ABOVE = 1;",
  "export default function Fixture() {",
  "  return null;",
  "}",
].join("\n");

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
      "  return <Text style={styles.item}>{ConfirmRows[0] + amount}</Text>;",
      "}",
      "",
      "const styles = StyleSheet.create({ item: { rowGap: 12 } });",
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
      "  return <Text style={styles.text}>x</Text>;",
      "}",
      "",
      'type Tone = "info" | "warn";',
      "",
      "const styles = StyleSheet.create({ text: { fontSize: 12 } });",
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
      "  return <View style={styles.frame} />;",
      "}",
      "",
      "const styles = StyleSheet.create({ frame: { width: FRAME_WIDTH } });",
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

// The comparator overload: scanning for the first function argument returned the
// comparator, so the name came back empty and `{Component}Props` lost its slot.
const CHIP_COMPARATOR =
  "export default memo(Chip, (a: ChipProps, b: ChipProps) => a.label === b.label);";

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

const M = S + "/domains/approval/components";

const NAMED_ARROW = [
  'import { FC } from "react";',
  "",
  "export const ApprovalErrorModal: FC = () => {",
  "  return <div />;",
  "};",
].join("\n");

test("filename check: reports a lone `export const Foo = () => …`", () => {
  reports(typePrefix, {
    filename: M + "/approval-error-modal.tsx",
    code: NAMED_ARROW,
    errors: [
      {
        messageId: "filenameMismatch",
        data: {
          component: "ApprovalErrorModal",
          base: "approval-error-modal.tsx",
        },
      },
    ],
  });
});

test("filename check: reports `export default function Foo`", () => {
  reports(typePrefix, {
    filename: M + "/section-balance.tsx",
    code: "export default function SectionBalance() {\n  return <div />;\n}",
    errors: [
      {
        messageId: "filenameMismatch",
        data: { component: "SectionBalance", base: "section-balance.tsx" },
      },
    ],
  });
});

test("filename check: reports `export default Foo` resolved to a local binding", () => {
  reports(typePrefix, {
    filename: M + "/card-limit.tsx",
    code: "const CardLimit = () => <div />;\n\nexport default CardLimit;",
    errors: [
      {
        messageId: "filenameMismatch",
        data: { component: "CardLimit", base: "card-limit.tsx" },
      },
    ],
  });
});

test("filename check: reports a PascalCase file naming a different component", () => {
  reports(typePrefix, {
    filename: M + "/CardSummary.tsx",
    code: "export default function ModalSummary() {\n  return <div />;\n}",
    errors: [
      {
        messageId: "filenameMismatch",
        data: { component: "ModalSummary", base: "CardSummary.tsx" },
      },
    ],
  });
});

test("filename check: a matching filename passes", () => {
  passes(typePrefix, {
    filename: M + "/ModalApproval.tsx",
    code: "export default function ModalApproval() {\n  return <div />;\n}",
  });
});

test("filename check: skips a dynamic route segment under src/app/", () => {
  passes(typePrefix, {
    filename: S + "/app/transfer/result/[transferId].tsx",
    code: "const TransferResultRoute = () => <div />;\n\nexport default TransferResultRoute;",
  });
});

test("filename check: skips a router special file under src/app/", () => {
  passes(typePrefix, {
    filename: S + "/app/_layout.tsx",
    code: "export default function RootLayout() {\n  return <div />;\n}",
  });
});

test("filename check: a route-shaped name outside src/app/ is still checked", () => {
  reports(typePrefix, {
    filename: S + "/screens/transfer/[transferId].tsx",
    code: "const TransferDetails = () => <div />;\n\nexport default TransferDetails;",
    errors: [
      {
        messageId: "filenameMismatch",
        data: { component: "TransferDetails", base: "[transferId].tsx" },
      },
    ],
  });
});

test("filename check: a folder named app outside src/app/ is not a route", () => {
  reports(typePrefix, {
    filename:
      "/home/app/ryt-transfer/src/domains/approval/components/approval-error-modal.tsx",
    code: NAMED_ARROW,
    errors: [{ messageId: "filenameMismatch" }],
  });
});

test("filename check: skips index.tsx — an entry point, not a component filename", () => {
  passes(typePrefix, {
    filename: M + "/field-pin/index.tsx",
    code: "export const FieldPin = () => <div />;",
  });
});

test("filename check: skips a class that does not extend React's", () => {
  passes(typePrefix, {
    filename: S + "/mocks/models/transfer-request-model.tsx",
    code: "import BaseModel from '../BaseModel';\n\nexport default class TransferRequestModel extends BaseModel {}",
  });
});

test("filename check: skips a call result", () => {
  passes(typePrefix, {
    filename: S + "/shared/ui/icons/chevron-right.tsx",
    code: "import { makeIcon } from './make-icon';\n\nexport const ChevronRight = makeIcon(<svg />);",
  });
});

test("filename check: skips a tagged template", () => {
  passes(typePrefix, {
    filename: M + "/styled-cell.tsx",
    code: "const css = (s) => s;\n\nexport const StyledCell = css`color: red;`;",
  });
});

test("filename check: skips a lowercase binding — hooks, HOCs, utils", () => {
  passes(typePrefix, {
    filename: S + "/shared/lib/with-pin-guard.tsx",
    code: "export const withPinGuard = (C) => () => <C />;",
  });
});

test("filename check: a file with no default export and two candidates is deliberately unjudged", () => {
  passes(typePrefix, {
    filename: M + "/row-parts.tsx",
    code: "export const RowHeader = () => <div />;\n\nexport const RowFooter = () => <div />;",
  });
});

test("filename check: skips a module that names no component", () => {
  passes(typePrefix, {
    filename: S + "/shared/errors/error-handle.tsx",
    code: "export const handleError = (e) => e;\n\nexport const RETRIES = 3;",
  });
});

test("filename check: skips a test file", () => {
  passes(typePrefix, {
    filename: M + "/approval-error-modal.test.tsx",
    code: NAMED_ARROW,
  });
});

test("filename check: a mismatch reports once, not alongside the Type error", () => {
  reports(typePrefix, {
    filename: M + "/home-nav-tile.tsx",
    code: "export default function HomeNavTile() {\n  return <div />;\n}",
    errors: [{ messageId: "filenameMismatch" }],
  });
});

test("filename check: once the filename matches, the Type check still applies", () => {
  reports(typePrefix, {
    filename: M + "/HomeNavTile.tsx",
    code: "export default function HomeNavTile() {\n  return <div />;\n}",
    errors: [{ messageId: "typePrefix" }],
  });
});
