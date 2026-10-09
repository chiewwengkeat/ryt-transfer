"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

// component-type-prefix's filename-only cases live in rules.test.js; the ones that
// need the AST to find the exported component live here.
const typePrefix = require("./component-type-prefix");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

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

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const S = "/repo/src";

function passes(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [testCase], invalid: [] });
}
function reports(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [], invalid: [testCase] });
}

const M = S + "/domains/approval/components";

const NAMED_ARROW = [
  'import { FC } from "react";',
  "",
  "export const ApprovalErrorModal: FC = () => {",
  "  return <div />;",
  "};",
].join("\n");
