"use strict";

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { parser } = require("typescript-eslint");
const noBlankLine = require("./no-blank-line-between-imports");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("no-blank-line-between-imports: one block passes", () => {
  passes(['import a from "a";', 'import { b } from "b";', "", "a(b);"]);
});

test("no-blank-line-between-imports: a comment line between imports passes", () => {
  passes(['import a from "a";', "// Why b loads here.", 'import b from "b";']);
});

test("no-blank-line-between-imports: a first side-effect import may keep a blank line after it", () => {
  passes([
    'import "./load-first";',
    "",
    'import a from "a";',
    'import b from "b";',
  ]);
});

test("no-blank-line-between-imports: imports split by another statement pass", () => {
  passes(['import a from "a";', "", "a();", "", 'import b from "b";']);
});

test("no-blank-line-between-imports: joins two imports split by a blank line", () => {
  fixes(
    ['import a from "a";', "", 'import b from "b";'],
    ['import a from "a";', 'import b from "b";'],
  );
});

test("no-blank-line-between-imports: joins two requires split by a blank line", () => {
  fixes(
    [
      'const fs = require("node:fs");',
      "",
      'const { join } = require("node:path").posix;',
    ],
    [
      'const fs = require("node:fs");',
      'const { join } = require("node:path").posix;',
    ],
  );
});

test("no-blank-line-between-imports: keeps a comment when it removes the blank line above it", () => {
  fixes(
    ['import a from "a";', "", "// Why b loads here.", 'import b from "b";'],
    ['import a from "a";', "// Why b loads here.", 'import b from "b";'],
  );
});

test("no-blank-line-between-imports: a side-effect import that is not first keeps no blank line", () => {
  fixes(
    ['import a from "a";', 'import "./polyfill";', "", 'import b from "b";'],
    ['import a from "a";', 'import "./polyfill";', 'import b from "b";'],
  );
});

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});

function passes(lines) {
  ruleTester.run("rule", noBlankLine, {
    valid: [{ code: lines.join("\n") }],
    invalid: [],
  });
}
function fixes(lines, fixedLines) {
  ruleTester.run("rule", noBlankLine, {
    valid: [],
    invalid: [
      {
        code: lines.join("\n"),
        output: fixedLines.join("\n"),
        errors: [{ messageId: "blankLine" }],
      },
    ],
  });
}
