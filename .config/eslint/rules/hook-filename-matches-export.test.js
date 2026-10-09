"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

const hookFilename = require("./hook-filename-matches-export");
// `useContentHeight.tsx` breaks hook-file-kebab-case too; the last case asserts the
// two rules suggest the same rename rather than pulling in opposite directions.
const kebabCase = require("./hook-file-kebab-case");

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
const H = S + "/shared/hooks";
const FLOW_STORE = S + "/screens/transfer/flow-store";

function passes(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [testCase], invalid: [] });
}
function reports(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [], invalid: [testCase] });
}
function rename(data) {
  return [{ messageId: "rename", data }];
}

test("hook-filename-matches-export: a named hook export matching its kebab filename passes", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: "export function useContentHeight() { return 0; }",
  });
});

test("hook-filename-matches-export: a default-exported hook matching its filename passes", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: "export default function useContentHeight() { return 0; }",
  });
});

test("hook-filename-matches-export: an arrow hook in a const matching its filename passes", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a declaration plus `export default` of it counts as ONE export", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: [
      "export function useContentHeight() { return 0; }",
      "export default useContentHeight;",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: `export { useContentHeight }` matching its filename passes", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: [
      "function useContentHeight() { return 0; }",
      "export { useContentHeight };",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: use-last-7-days.ts / useLast7Days passes", () => {
  passes(hookFilename, {
    filename: S + "/domains/transfer/hooks/use-last-7-days.ts",
    code: "export const useLast7Days = () => 0;",
  });
});

test("hook-filename-matches-export: use-top-3-recents.ts / useTop3Recents passes", () => {
  passes(hookFilename, {
    filename: S + "/domains/transfer/hooks/use-top-3-recents.ts",
    code: "export const useTop3Recents = () => 0;",
  });
});

test("hook-filename-matches-export: the lossy kebabCase spelling is accepted too", () => {
  passes(hookFilename, {
    filename: H + "/use-last7-days.ts",
    code: "export const useLast7Days = () => 0;",
  });
});

test("hook-filename-matches-export: use-utf8-encoder.ts / useUtf8Encoder passes", () => {
  passes(hookFilename, {
    filename: H + "/use-utf8-encoder.ts",
    code: "export const useUtf8Encoder = () => 0;",
  });
});

test("hook-filename-matches-export: flow-store/transfer.ts exporting useTransferStore passes", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/transfer.ts",
    code: "export const useTransferStore = () => 0;",
  });
});

test("hook-filename-matches-export: use-transfer-store.ts exporting useTransferStore passes", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/use-transfer-store.ts",
    code: "export const useTransferStore = () => 0;",
  });
});

test("hook-filename-matches-export: use-recipient.ts exporting useRecipientStore passes", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/use-recipient.ts",
    code: "export const useRecipientStore = () => 0;",
  });
});

test("hook-filename-matches-export: store.ts exporting useStore passes — stripAffixes refuses to empty", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/store.ts",
    code: "export const useStore = () => 0;",
  });
});

test("hook-filename-matches-export: an index.ts barrel is exempt", () => {
  passes(hookFilename, {
    filename: H + "/index.ts",
    code: "export { useContentHeight } from './use-content-height';",
  });
});

test("hook-filename-matches-export: an index.tsx barrel is exempt", () => {
  passes(hookFilename, {
    filename: H + "/index.tsx",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a file exporting a component AND a hook keeps its component filename", () => {
  passes(hookFilename, {
    filename: S + "/domains/account/components/CardBalance/CardBalance.tsx",
    code: [
      "export const useCardBalanceHeight = () => 0;",
      "export default function CardBalance() { return <div />; }",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: two hook exports are not a sole export", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/use-flow-context.tsx",
    code: [
      "export const useFlow = () => 0;",
      "export const useFlowDispatch = () => 0;",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: a sole component export never triggers", () => {
  passes(hookFilename, {
    filename: S + "/shared/observability/use-render-profiler.tsx",
    code: "export default function RenderProfiler() { return <div />; }",
  });
});

test("hook-filename-matches-export: a sole non-hook export never triggers", () => {
  passes(hookFilename, {
    filename: S + "/shared/lib/money/money.ts",
    code: "export const formatAmount = () => '';",
  });
});

test("hook-filename-matches-export: `userActions` does not match /^use[A-Z]/", () => {
  passes(hookFilename, {
    filename: S + "/mocks/bank/actions.ts",
    code: "export const userActions = { reset: 1 };",
  });
});

test("hook-filename-matches-export: an anonymous default export never triggers", () => {
  passes(hookFilename, {
    filename: H + "/whatever.ts",
    code: "export default () => 0;",
  });
});

test("hook-filename-matches-export: a hook exported beside its own TYPE is still a sole export", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.ts",
    code: [
      "export type UseContentHeightResult = { height: number };",
      "export const useContentHeight = () => ({ height: 0 });",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: an inline `export { type X, useFoo }` type specifier is not counted", () => {
  passes(hookFilename, {
    filename: H + "/use-foo.ts",
    code: [
      "type Result = number;",
      "const useFoo = () => 0;",
      "export { type Result, useFoo };",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: `export * from` makes the surface unknowable, so the rule bails", () => {
  passes(hookFilename, {
    filename: FLOW_STORE + "/legacy.ts",
    code: [
      "export * from './other';",
      "export const useRecipientStore = () => 0;",
    ].join("\n"),
  });
});

test("hook-filename-matches-export: a .test.ts file is skipped", () => {
  passes(hookFilename, {
    filename: H + "/whatever.test.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a .spec.ts file is skipped", () => {
  passes(hookFilename, {
    filename: H + "/whatever.spec.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a .d.ts file is skipped", () => {
  passes(hookFilename, {
    filename: S + "/shared/types/whatever.d.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a role suffix is kept, and the stem alone is checked", () => {
  passes(hookFilename, {
    filename: H + "/use-content-height.helper.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: a bare filename with no directory is inert", () => {
  passes(hookFilename, {
    filename: "whatever.ts",
    code: "export const useContentHeight = () => 0;",
  });
});

test("hook-filename-matches-export: use-sync-height.tsx exporting useSyncRefHeight reports", () => {
  reports(hookFilename, {
    filename: H + "/use-sync-height.tsx",
    code: "export const useSyncRefHeight = () => 0;",
    errors: rename({
      file: "use-sync-height.tsx",
      hook: "useSyncRefHeight",
      kebab: "use-sync-ref-height.tsx",
    }),
  });
});

test("hook-filename-matches-export: use-amount-entry.tsx exporting useAmountForm reports", () => {
  reports(hookFilename, {
    filename:
      S + "/screens/transfer/TransferAmountScreen/hooks/use-amount-entry.tsx",
    code: "export const useAmountForm = () => 0;",
    errors: rename({
      file: "use-amount-entry.tsx",
      hook: "useAmountForm",
      kebab: "use-amount-form.tsx",
    }),
  });
});

test("hook-filename-matches-export: a store file named for neither the hook nor its core reports", () => {
  reports(hookFilename, {
    filename: FLOW_STORE + "/legacy.ts",
    code: "export const useRecipientStore = () => 0;",
    errors: rename({
      file: "legacy.ts",
      hook: "useRecipientStore",
      kebab: "use-recipient-store.ts",
    }),
  });
});

test("hook-filename-matches-export: a camelCase filename reports — camelCase() leaves it untouched", () => {
  reports(hookFilename, {
    filename: H + "/useContentHeight.tsx",
    code: "export const useContentHeight = () => 0;",
    errors: rename({
      file: "useContentHeight.tsx",
      hook: "useContentHeight",
      kebab: "use-content-height.tsx",
    }),
  });
});

test("hook-filename-matches-export: a PascalCase filename with a sole hook export reports", () => {
  reports(hookFilename, {
    filename: S + "/domains/approval/hooks/PinPad.ts",
    code: "export const usePinPad = () => 0;",
    errors: rename({
      file: "PinPad.ts",
      hook: "usePinPad",
      kebab: "use-pin-pad.ts",
    }),
  });
});

test("hook-filename-matches-export: a missing word boundary reports — only the first letter is case-folded", () => {
  reports(hookFilename, {
    filename: H + "/use-contentheight.ts",
    code: "export const useContentHeight = () => 0;",
    errors: rename({
      file: "use-contentheight.ts",
      hook: "useContentHeight",
      kebab: "use-content-height.ts",
    }),
  });
});

test("hook-filename-matches-export: a plain-named file whose sole export is a hook reports", () => {
  reports(hookFilename, {
    filename: S + "/shared/utils/height.ts",
    code: "export function useContentHeight() { return 0; }",
    errors: rename({
      file: "height.ts",
      hook: "useContentHeight",
      kebab: "use-content-height.ts",
    }),
  });
});

test("hook-filename-matches-export: `export { useFoo as default }` is read through to the local name", () => {
  reports(hookFilename, {
    filename: S + "/shared/utils/height.ts",
    code: [
      "function useContentHeight() { return 0; }",
      "export { useContentHeight as default };",
    ].join("\n"),
    errors: rename({
      file: "height.ts",
      hook: "useContentHeight",
      kebab: "use-content-height.ts",
    }),
  });
});

test("hook-filename-matches-export: the suggested rename keeps a role suffix", () => {
  reports(hookFilename, {
    filename: S + "/shared/utils/height.helper.ts",
    code: "export const useContentHeight = () => 0;",
    errors: rename({
      file: "height.helper.ts",
      hook: "useContentHeight",
      kebab: "use-content-height.helper.ts",
    }),
  });
});

test("hook-filename-matches-export: hook-file-kebab-case reports the SAME rename on the same file", () => {
  reports(kebabCase, {
    filename: H + "/useContentHeight.tsx",
    code: "export const useContentHeight = () => 0;",
    errors: [
      {
        messageId: "kebab",
        data: { file: "useContentHeight.tsx", kebab: "use-content-height.tsx" },
      },
    ],
  });
});
