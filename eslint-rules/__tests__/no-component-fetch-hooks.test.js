"use strict";
// These cases need real TS/JSX parsing, so the parser require is top-level and
// unguarded: if it is missing the file fails to load and node:test reports it,
// which is what we want — a skipped suite would be a false green.

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");

const rule = require("../no-component-fetch-hooks");

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
const C = S + "/domains/transfer/components/SectionRecents/SectionRecents.tsx";
const recentsFetch = (hook) => [
  { messageId: "componentFetch", data: { file: "SectionRecents.tsx", hook } },
];

function passes(testCase) {
  ruleTester.run("no-component-fetch-hooks", rule, {
    valid: [testCase],
    invalid: [],
  });
}
function reports(testCase) {
  ruleTester.run("no-component-fetch-hooks", rule, {
    valid: [],
    invalid: [testCase],
  });
}

test("valid: a component calling its domain's own query hook", () => {
  passes({
    filename: C,
    code: [
      'import { useListRecentRecipients } from "../../api/list-recent-recipients/list-recent-recipients";',
      "export default function SectionRecents() {",
      "  const { data } = useListRecentRecipients();",
      "  return <div>{data}</div>;",
      "}",
    ].join("\n"),
  });
});

test("valid: useQueryClient in a component", () => {
  passes({
    filename: C,
    code: [
      'import { useQueryClient } from "@tanstack/react-query";',
      "export default function SectionRecents() {",
      "  const queryClient = useQueryClient();",
      "  return <button onClick={() => queryClient.invalidateQueries()} />;",
      "}",
    ].join("\n"),
  });
});

test("valid: cancelQueries + setQueryData off an options factory", () => {
  passes({
    filename:
      S +
      "/screens/transfer/TransferResultScreen/components/ButtonRetryStatus/ButtonRetryStatus.tsx",
    code: [
      'import { useQueryClient } from "@tanstack/react-query";',
      'import { getTransferOptions } from "@/domains/transfer/api/get-transfer/get-transfer";',
      "export default function ButtonRetryStatus({ transferId }) {",
      "  const queryClient = useQueryClient();",
      "  const retry = async () => {",
      "    await queryClient.cancelQueries(getTransferOptions({ transferId }));",
      "    queryClient.setQueryData(getTransferOptions({ transferId }).queryKey, null);",
      "  };",
      "  return <button onClick={retry} />;",
      "}",
    ].join("\n"),
  });
});

test("valid: importing a query's options object without calling a fetch hook", () => {
  passes({
    filename: C,
    code: [
      'import { getTransferOptions } from "../../api/get-transfer/get-transfer";',
      "export default function SectionRecents({ transferId }) {",
      "  const key = getTransferOptions({ transferId }).queryKey;",
      "  return <div>{key}</div>;",
      "}",
    ].join("\n"),
  });
});

test("valid: a prop named useQueryResult, destructured", () => {
  passes({
    filename: S + "/shared/ui/ViewInfiniteList/ViewInfiniteList.tsx",
    code: [
      'import { UseInfiniteQueryResult } from "@tanstack/react-query";',
      "interface Props { useQueryResult: UseInfiniteQueryResult<string>; }",
      "export default function ViewInfiniteList({ useQueryResult }: Props) {",
      "  const { data } = useQueryResult;",
      "  return <div>{data}</div>;",
      "}",
    ].join("\n"),
  });
});

test("valid: a prop named useQueryResult that is called — a local, not the import", () => {
  passes({
    filename: S + "/shared/ui/ViewInfiniteList/ViewInfiniteList.tsx",
    code: [
      'import { UseInfiniteQueryResult } from "@tanstack/react-query";',
      "export default function ViewInfiniteList({ useQueryResult }) {",
      "  const result: UseInfiniteQueryResult<string> = useQueryResult();",
      "  return <div>{result}</div>;",
      "}",
    ].join("\n"),
  });
});

test("valid: a .ts data-layer module calling useQuery", () => {
  passes({
    filename: S + "/domains/transfer/api/get-transfer/get-transfer.ts",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export const useGetTransfer = () => useQuery({ queryKey: ["transfers"] });',
    ].join("\n"),
  });
});

test("valid: a use-*.tsx hook module calling useMutation", () => {
  passes({
    filename: S + "/domains/approval/hooks/use-register-keys.tsx",
    code: [
      'import { useMutation } from "@tanstack/react-query";',
      "export default function useRegisterKeys() {",
      "  return useMutation({ mutationFn: async () => null });",
      "}",
    ].join("\n"),
  });
});

test("valid: a camelCase hook file calling useQuery", () => {
  passes({
    filename: S + "/shared/hooks/useContentHeight.tsx",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export default function useContentHeight() { return useQuery({ queryKey: ["h"] }); }',
    ].join("\n"),
  });
});

test("valid: a .test.tsx calling useQuery", () => {
  passes({
    filename: S + "/test/routes/transfer-details.test.tsx",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export function Probe() { useQuery({ queryKey: ["t"] }); return <div />; }',
    ].join("\n"),
  });
});

test("valid: a compound .route.test.tsx suffix is still a test", () => {
  passes({
    filename: S + "/test/routes/transfer-history.route.test.tsx",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export function Probe() { useQuery({ queryKey: ["t"] }); return <div />; }',
    ].join("\n"),
  });
});

test("valid: a .spec.tsx calling useQuery", () => {
  passes({
    filename:
      S + "/domains/transfer/components/SectionRecents/SectionRecents.spec.tsx",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export function Probe() { useQuery({ queryKey: ["t"] }); return <div />; }',
    ].join("\n"),
  });
});

test("valid: a locally declared useQuery is not the import", () => {
  passes({
    filename: C,
    code: [
      "function useQuery() { return { data: 1 }; }",
      "export default function SectionRecents() {",
      "  const { data } = useQuery();",
      "  return <div>{data}</div>;",
      "}",
    ].join("\n"),
  });
});

test("valid: useQuery imported from a relative module, not @tanstack/react-query", () => {
  passes({
    filename: C,
    code: [
      'import { useQuery } from "../../api/local-query";',
      "export default function SectionRecents() { useQuery(); return <div />; }",
    ].join("\n"),
  });
});

test("valid: a namespaced useQueryClient call", () => {
  passes({
    filename: C,
    code: [
      'import * as rq from "@tanstack/react-query";',
      "export default function SectionRecents() { rq.useQueryClient(); return <div />; }",
    ].join("\n"),
  });
});

test("valid: calling the namespace itself", () => {
  passes({
    filename: C,
    code: [
      'import * as rq from "@tanstack/react-query";',
      "export default function SectionRecents() { rq(); return <div />; }",
    ].join("\n"),
  });
});

test("valid: a type-only import of useQuery is never a call", () => {
  passes({
    filename: C,
    code: [
      'import type { useQuery } from "@tanstack/react-query";',
      "export default function SectionRecents() { return <div />; }",
    ].join("\n"),
  });
});

test("invalid: a component calling useQuery", () => {
  reports({
    filename: C,
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      "export default function SectionRecents() {",
      '  const { data } = useQuery({ queryKey: ["recents"] });',
      "  return <div>{data}</div>;",
      "}",
    ].join("\n"),
    errors: recentsFetch("useQuery"),
  });
});

test("invalid: a component calling useMutation", () => {
  reports({
    filename: C,
    code: [
      'import { useMutation } from "@tanstack/react-query";',
      "export default function SectionRecents() {",
      "  const { mutate } = useMutation({ mutationFn: async () => null });",
      "  return <button onClick={mutate} />;",
      "}",
    ].join("\n"),
    errors: recentsFetch("useMutation"),
  });
});

test("invalid: a component calling useInfiniteQuery", () => {
  reports({
    filename: C,
    code: [
      'import { useInfiniteQuery } from "@tanstack/react-query";',
      "export default function SectionRecents() {",
      '  const { data } = useInfiniteQuery({ queryKey: ["list"] });',
      "  return <div>{data}</div>;",
      "}",
    ].join("\n"),
    errors: recentsFetch("useInfiniteQuery"),
  });
});

test("invalid: a renamed import still resolves through the binding", () => {
  reports({
    filename: C,
    code: [
      'import { useQuery as useQ } from "@tanstack/react-query";',
      'export default function SectionRecents() { useQ({ queryKey: ["r"] }); return <div />; }',
    ].join("\n"),
    errors: recentsFetch("useQuery"),
  });
});

test("invalid: a namespaced rq.useQuery call", () => {
  reports({
    filename: C,
    code: [
      'import * as rq from "@tanstack/react-query";',
      'export default function SectionRecents() { rq.useQuery({ queryKey: ["r"] }); return <div />; }',
    ].join("\n"),
    errors: recentsFetch("useQuery"),
  });
});

test("invalid: two fetch calls in one component report twice", () => {
  reports({
    filename: C,
    code: [
      'import { useMutation, useQuery } from "@tanstack/react-query";',
      "export default function SectionRecents() {",
      '  useQuery({ queryKey: ["r"] });',
      "  useMutation({ mutationFn: async () => null });",
      "  return <div />;",
      "}",
    ].join("\n"),
    errors: [...recentsFetch("useQuery"), ...recentsFetch("useMutation")],
  });
});

test("invalid: a route file calling useQuery, since a route only re-exports a screen", () => {
  reports({
    filename: S + "/app/_layout.tsx",
    code: [
      'import { QueryClientProvider, useQuery } from "@tanstack/react-query";',
      "export default function Layout({ client, children }) {",
      '  useQuery({ queryKey: ["boot"] });',
      "  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;",
      "}",
    ].join("\n"),
    errors: [
      {
        messageId: "componentFetch",
        data: { file: "_layout.tsx", hook: "useQuery" },
      },
    ],
  });
});

test("invalid: 'user-profile' starts with use but is not a hook file", () => {
  reports({
    filename: S + "/shared/ui/user-profile.tsx",
    code: [
      'import { useQuery } from "@tanstack/react-query";',
      'export default function UserProfile() { useQuery({ queryKey: ["u"] }); return <div />; }',
    ].join("\n"),
    errors: [{ messageId: "componentFetch" }],
  });
});
