"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const {
  camelCase,
  dirEntries,
  filenameOf,
  isRelativeSource,
  joinPath,
  kebabCase,
  parsePath,
  resolveModule,
  stripAffixes,
} = require("./_paths");

test("filenameOf: reads context.filename", () => {
  assert.equal(
    filenameOf({ filename: "/repo/src/Foo.tsx" }),
    "/repo/src/Foo.tsx",
  );
});

test("filenameOf: normalises Windows separators", () => {
  assert.equal(
    filenameOf({ filename: "C:\\repo\\src\\Foo.tsx" }),
    "C:/repo/src/Foo.tsx",
  );
});

test("parsePath: a compound suffix splits stem from every role word", () => {
  const p = parsePath(
    "/repo/src/domains/account/components/CardBalance/CardBalance.helper.test.ts",
  );
  assert.deepEqual(
    {
      dir: p.dir,
      base: p.base,
      stem: p.stem,
      suffixes: p.suffixes,
      ext: p.ext,
      parent: p.parent,
    },
    {
      dir: "/repo/src/domains/account/components/CardBalance",
      base: "CardBalance.helper.test.ts",
      stem: "CardBalance",
      suffixes: ["helper", "test"],
      ext: "ts",
      parent: "CardBalance",
    },
  );
});

test("parsePath: a plain component has no suffixes", () => {
  const p = parsePath("/repo/src/Foo/Foo.tsx");
  assert.equal(p.stem, "Foo");
  assert.deepEqual(p.suffixes, []);
  assert.equal(p.ext, "tsx");
});

test("parsePath: a style sibling reads style as its suffix", () => {
  const p = parsePath("/repo/src/shared/ui/FieldText/field-text.style.ts");
  assert.equal(p.stem, "field-text");
  assert.deepEqual(p.suffixes, ["style"]);
  assert.equal(p.ext, "ts");
});

test("parsePath: an index barrel keeps index as the stem", () => {
  const p = parsePath("/repo/src/screens/transfer/components/index.type.ts");
  assert.equal(p.stem, "index");
  assert.deepEqual(p.suffixes, ["type"]);
});

test("parsePath: a .d.ts declaration reads d as a suffix", () => {
  const p = parsePath("/repo/src/shared/types/env.d.ts");
  assert.equal(p.stem, "env");
  assert.deepEqual(p.suffixes, ["d"]);
  assert.equal(p.ext, "ts");
});

test("parsePath: a dynamic-route filename keeps its brackets", () => {
  const p = parsePath("/repo/src/app/transfer/result/[transferId].tsx");
  assert.equal(p.stem, "[transferId]");
  assert.equal(p.parent, "result");
});

test("parsePath: a file with no extension has an empty ext", () => {
  const p = parsePath("/repo/README");
  assert.equal(p.stem, "README");
  assert.equal(p.ext, "");
  assert.deepEqual(p.suffixes, []);
});

test("parsePath: a dotfile's leading dot belongs to the stem", () => {
  const p = parsePath("/repo/.eslintrc.json");
  assert.equal(p.stem, ".eslintrc");
  assert.equal(p.ext, "json");
  assert.deepEqual(p.suffixes, []);
});

test("parsePath: a bare filename has an empty dir and parent", () => {
  const p = parsePath("Foo.tsx");
  assert.equal(p.dir, "");
  assert.equal(p.parent, "");
  assert.deepEqual(p.dirSegments, []);
});

test("parsePath: dirSegments lists the directories only", () => {
  const p = parsePath("/repo/src/domains/account/Foo.tsx");
  assert.deepEqual(p.dirSegments, ["repo", "src", "domains", "account"]);
});

test("parsePath: normalises Windows separators", () => {
  assert.equal(parsePath("C:\\repo\\src\\Foo.tsx").parent, "src");
});

test("camelCase: a digit-initial word survives (use-last-7-days)", () => {
  assert.equal(camelCase("use-last-7-days"), "useLast7Days");
});

test("camelCase: a digit inside a word survives (use-utf8-encoder)", () => {
  assert.equal(camelCase("use-utf8-encoder"), "useUtf8Encoder");
});

test("camelCase: use-top-3-recents reaches useTop3Recents", () => {
  assert.equal(camelCase("use-top-3-recents"), "useTop3Recents");
});

test("camelCase: an ordinary hook name", () => {
  assert.equal(camelCase("use-content-height"), "useContentHeight");
});

test("camelCase: a single segment is unchanged", () => {
  assert.equal(camelCase("recipient"), "recipient");
});

test("camelCase: empty segments from a doubled dash are dropped", () => {
  assert.equal(camelCase("use--card-balance"), "useCardBalance");
});

test("kebabCase: matches hook-file-kebab-case's own transform", () => {
  assert.equal(kebabCase("useContentHeight"), "use-content-height");
});

test("kebabCase: a PascalCase name gains no leading dash", () => {
  assert.equal(kebabCase("CardBalance"), "card-balance");
});

test("kebabCase: is lossy on a digit-initial word, which is why it never decides", () => {
  assert.equal(kebabCase("useLast7Days"), "use-last7-days");
  assert.notEqual(kebabCase("useLast7Days"), "use-last-7-days");
});

test("kebabCase: an already-kebab name is unchanged", () => {
  assert.equal(kebabCase("use-content-height"), "use-content-height");
});

test("stripAffixes: strips a use prefix and a Store suffix", () => {
  assert.equal(
    stripAffixes("useTransferStore", { lead: ["use"], trail: ["Store"] }),
    "Transfer",
  );
});

test("stripAffixes: a store outside state/ is still reduced the same way", () => {
  assert.equal(
    stripAffixes("useRecipientStore", { lead: ["use"], trail: ["Store"] }),
    "Recipient",
  );
});

test("stripAffixes: refuses to empty the name", () => {
  assert.equal(
    stripAffixes("useStore", { lead: ["use"], trail: ["Store"] }),
    "Store",
  );
});

test("stripAffixes: an unmatched affix leaves the name alone", () => {
  assert.equal(
    stripAffixes("useCardBalance", { lead: ["use"], trail: ["Store"] }),
    "CardBalance",
  );
});

test("stripAffixes: the longest matching affix wins", () => {
  assert.equal(
    stripAffixes("useGetThing", { lead: ["use", "useGet"] }),
    "Thing",
  );
});

test("stripAffixes: no affixes given returns the name", () => {
  assert.equal(stripAffixes("useCardBalance"), "useCardBalance");
});

test("dirEntries: lists a real directory", () => {
  const root = tree(["Foo/Foo.tsx", "Foo/Foo.style.ts"]);
  assert.deepEqual(dirEntries(root + "/Foo").sort(), [
    "Foo.style.ts",
    "Foo.tsx",
  ]);
});

test("dirEntries: a missing directory yields [] rather than throwing", () => {
  assert.deepEqual(dirEntries("/repo/src/does-not-exist"), []);
});

test("dirEntries: a file path yields [] rather than throwing", () => {
  const root = tree(["Foo/Foo.tsx"]);
  assert.deepEqual(dirEntries(root + "/Foo/Foo.tsx"), []);
});

test("isRelativeSource: ./ and ../ are relative", () => {
  assert.equal(isRelativeSource("./helper"), true);
  assert.equal(isRelativeSource("../Bar/internal"), true);
});

test("isRelativeSource: a package specifier is not", () => {
  assert.equal(isRelativeSource("@tanstack/react-query"), false);
});

test("isRelativeSource: an alias path is not", () => {
  assert.equal(isRelativeSource("@/screens/transfer/helper"), false);
});

test("isRelativeSource: bare . and .. are relative", () => {
  assert.equal(isRelativeSource("."), true);
  assert.equal(isRelativeSource(".."), true);
});

test("isRelativeSource: a dotfile-looking specifier is not relative", () => {
  assert.equal(isRelativeSource(".eslintrc"), false);
});

test("joinPath: .. climbs out of the current folder", () => {
  assert.equal(
    joinPath("/repo/src/account/Foo", "../Bar/internal"),
    "/repo/src/account/Bar/internal",
  );
});

test("joinPath: ./ stays in the folder", () => {
  assert.equal(
    joinPath("/repo/src/account/Foo", "./helper"),
    "/repo/src/account/Foo/helper",
  );
});

test("joinPath: repeated .. climbs repeatedly", () => {
  assert.equal(
    joinPath("/repo/src/account/Foo", "../../shared/x"),
    "/repo/src/shared/x",
  );
});

test("joinPath: a trailing slash adds no empty segment", () => {
  assert.equal(
    joinPath("/repo/src/account/Foo", "../Bar/"),
    "/repo/src/account/Bar",
  );
});

test("resolveModule: resolves a sibling .tsx", () => {
  const root = tree(["account/Foo/Foo.tsx", "account/Bar/Bar.tsx"]);
  assert.equal(
    resolveModule(root + "/account/Foo/Foo.tsx", "../Bar/Bar"),
    root + "/account/Bar/Bar.tsx",
  );
});

test("resolveModule: prefers .ts over .js at the same path", () => {
  const root = tree([
    "account/Foo/Foo.tsx",
    "account/Foo/helper.ts",
    "account/Foo/helper.js",
  ]);
  assert.equal(
    resolveModule(root + "/account/Foo/Foo.tsx", "./helper"),
    root + "/account/Foo/helper.ts",
  );
});

test("resolveModule: falls through to a folder's index barrel", () => {
  const root = tree([
    "account/Foo/Foo.tsx",
    "account/Bar/index.ts",
    "account/Bar/Bar.tsx",
  ]);
  assert.equal(
    resolveModule(root + "/account/Foo/Foo.tsx", "../Bar"),
    root + "/account/Bar/index.ts",
  );
});

test("resolveModule: a package specifier resolves to null", () => {
  const root = tree(["account/Foo/Foo.tsx"]);
  assert.equal(
    resolveModule(root + "/account/Foo/Foo.tsx", "@tanstack/react-query"),
    null,
  );
});

test("resolveModule: a relative path that does not exist resolves to null", () => {
  const root = tree(["account/Foo/Foo.tsx"]);
  assert.equal(
    resolveModule(root + "/account/Foo/Foo.tsx", "../Bar/Bar"),
    null,
  );
});

test("resolveModule: a folder with no index resolves to null", () => {
  const root = tree(["account/Foo/Foo.tsx", "account/Bar/Bar.tsx"]);
  assert.equal(resolveModule(root + "/account/Foo/Foo.tsx", "../Bar"), null);
});

/** A real directory tree. The disk-reading helpers return [] for a path that
 * does not exist, so a synthetic `/repo/src/...` filename makes them silently
 * inert — the same trap that would make a rule's `invalid` cases unreachable. */
function tree(files) {
  const root = mkdtempSync(tmpdir() + "/fe-paths-");
  for (const rel of files) {
    const full = root + "/" + rel;
    mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, "");
  }
  return root;
}
