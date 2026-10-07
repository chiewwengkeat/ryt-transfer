"use strict";
// The parser require is unguarded on purpose: a missing parser must fail this
// file, not skip it to a false green.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parser } = require("typescript-eslint");

const {
  fetchHookCall,
  importedBindings,
  moduleSources,
} = require("../_imports");

function program(code) {
  return parser.parseForESLint(code, {
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  }).ast;
}

function bindingsFor(code) {
  return importedBindings(program(code));
}

/** The first CallExpression in source order. */
function firstCall(node) {
  if (!node || typeof node.type !== "string") return null;
  if (node.type === "CallExpression") return node;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    for (const c of Array.isArray(child) ? child : [child]) {
      const found = c && typeof c === "object" ? firstCall(c) : null;
      if (found) return found;
    }
  }
  return null;
}

function callIn(code) {
  return firstCall(program(code));
}

const RQ =
  'import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";';

test("importedBindings: a named import binds under its local name", () => {
  const b = bindingsFor(RQ).get("useQuery");
  assert.equal(b.imported, "useQuery");
  assert.equal(b.source, "@tanstack/react-query");
  assert.equal(b.typeOnly, false);
});

test("importedBindings: an aliased import keeps both names", () => {
  const b = bindingsFor(
    'import { useQuery as uq } from "@tanstack/react-query";',
  ).get("uq");
  assert.equal(b.local, "uq");
  assert.equal(b.imported, "useQuery");
});

test("importedBindings: a default import reports 'default'", () => {
  const b = bindingsFor('import useGetTransfer from "./get-transfer";').get(
    "useGetTransfer",
  );
  assert.equal(b.imported, "default");
  assert.equal(b.source, "./get-transfer");
});

test("importedBindings: a namespace import reports '*'", () => {
  const b = bindingsFor('import * as rq from "@tanstack/react-query";').get(
    "rq",
  );
  assert.equal(b.imported, "*");
});

test("importedBindings: a whole-declaration type import is typeOnly", () => {
  const b = bindingsFor(
    'import type { UseQueryResult } from "@tanstack/react-query";',
  ).get("UseQueryResult");
  assert.equal(b.typeOnly, true);
});

test("importedBindings: an inline type specifier is typeOnly", () => {
  const b = bindingsFor(
    'import { type UseQueryResult, useQuery } from "@tanstack/react-query";',
  );
  assert.equal(b.get("UseQueryResult").typeOnly, true);
  assert.equal(b.get("useQuery").typeOnly, false);
});

test("importedBindings: a value import of a type-looking name is not typeOnly", () => {
  const b = bindingsFor(
    'import { UseInfiniteQueryResult } from "@tanstack/react-query";',
  );
  assert.equal(b.get("UseInfiniteQueryResult").typeOnly, false);
});

test("importedBindings: a string-literal import name is read", () => {
  const b = bindingsFor('import { "use-odd" as odd } from "./mod";').get("odd");
  assert.equal(b.imported, "use-odd");
});

test("importedBindings: a side-effect import binds nothing", () => {
  assert.equal(bindingsFor('import "./polyfills";').size, 0);
});

test("importedBindings: a file with no imports yields an empty map", () => {
  assert.equal(bindingsFor("const x = 1;").size, 0);
});

test("importedBindings: every specifier of one declaration is bound", () => {
  const b = bindingsFor(RQ);
  assert.deepEqual([...b.keys()].sort(), [
    "useMutation",
    "useQuery",
    "useQueryClient",
  ]);
});

test("fetchHookCall: useQuery from react-query is a fetch", () => {
  const code = RQ + "\nconst r = useQuery(opts);";
  assert.equal(
    fetchHookCall(callIn(code), bindingsFor(code)).imported,
    "useQuery",
  );
});

test("fetchHookCall: useMutation is a fetch", () => {
  const code = RQ + "\nconst r = useMutation(opts);";
  assert.equal(
    fetchHookCall(callIn(code), bindingsFor(code)).imported,
    "useMutation",
  );
});

test("fetchHookCall: useInfiniteQuery is a fetch", () => {
  const code =
    'import { useInfiniteQuery } from "@tanstack/react-query";\nconst r = useInfiniteQuery(opts);';
  assert.equal(
    fetchHookCall(callIn(code), bindingsFor(code)).imported,
    "useInfiniteQuery",
  );
});

test("fetchHookCall: useQueryClient is cache orchestration, not a fetch", () => {
  const code = RQ + "\nconst qc = useQueryClient();";
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: importing a query's options object is not a fetch", () => {
  const code =
    'import { getTransferOptions } from "../api/get-transfer/get-transfer";\nconst o = getTransferOptions(id);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a pure helper import is not a fetch", () => {
  const code =
    'import { formatAmount } from "./helpers";\nconst a = formatAmount(minor);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a useQueryResult prop is not a fetch", () => {
  const code =
    'import { UseInfiniteQueryResult } from "@tanstack/react-query";\n' +
    "const { data } = useQueryResult(x);";
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a locally declared useQuery is not the imported one", () => {
  const code =
    'import { formatAmount } from "./helpers";\nconst r = useQuery(opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a type-only import that is somehow called is not a fetch", () => {
  const code =
    'import type { useQuery } from "@tanstack/react-query";\nconst r = useQuery(opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a namespaced fetch is caught", () => {
  const code =
    'import * as rq from "@tanstack/react-query";\nconst r = rq.useInfiniteQuery(o);';
  assert.equal(
    fetchHookCall(callIn(code), bindingsFor(code)).imported,
    "useInfiniteQuery",
  );
});

test("fetchHookCall: calling the namespace itself is not a fetch", () => {
  const code =
    'import * as rq from "@tanstack/react-query";\nconst r = rq(opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a computed member call on the namespace is not a fetch", () => {
  const code =
    'import * as rq from "@tanstack/react-query";\nconst r = rq[name](opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: a member call on a default import is not a fetch", () => {
  const code =
    'import rq from "@tanstack/react-query";\nconst r = rq.useQuery(opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("fetchHookCall: useQuery from another module is not a fetch", () => {
  const code =
    'import { useQuery } from "./local-query";\nconst r = useQuery(opts);';
  assert.equal(fetchHookCall(callIn(code), bindingsFor(code)), null);
});

test("moduleSources: an import is listed", () => {
  const s = moduleSources(program('import { a } from "../Bar/internal";'));
  assert.deepEqual(
    s.map((x) => [x.source, x.kind]),
    [["../Bar/internal", "import"]],
  );
});

test("moduleSources: a re-export reaches across a folder and is listed", () => {
  const s = moduleSources(program('export { A } from "../Bar/internal";'));
  assert.deepEqual(
    s.map((x) => [x.source, x.kind]),
    [["../Bar/internal", "export"]],
  );
});

test("moduleSources: export * is listed", () => {
  const s = moduleSources(program('export * from "../Bar/internal";'));
  assert.equal(s[0].kind, "export");
});

test("moduleSources: a local export names no module", () => {
  assert.deepEqual(moduleSources(program("export const a = 1;")), []);
});

test("moduleSources: a type-only import is flagged", () => {
  assert.equal(
    moduleSources(program('import type { A } from "./a";'))[0].typeOnly,
    true,
  );
});

test("moduleSources: a type-only re-export is flagged", () => {
  assert.equal(
    moduleSources(program('export type { A } from "./a";'))[0].typeOnly,
    true,
  );
});

test("moduleSources: order follows the source", () => {
  const s = moduleSources(
    program('import "./a";\nexport * from "./b";\nimport "./c";'),
  );
  assert.deepEqual(
    s.map((x) => x.source),
    ["./a", "./b", "./c"],
  );
});
