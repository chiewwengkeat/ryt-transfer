"use strict";
// The filename-keyed rules. These never touch the AST, so they need no parser —
// the `code` body is inert and the filename carries every case.

const { test } = require("node:test");
const { RuleTester } = require("eslint");

const ownFolder = require("../component-own-folder");
const kebabCase = require("../hook-file-kebab-case");
const typePrefix = require("../component-type-prefix");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

const ruleTester = new RuleTester();
const S = "/repo/src";
const P = S + "/screens/transfer/TransferReviewScreen/components";
const ok = "const x = 1;";

function passes(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [testCase], invalid: [] });
}
function reports(rule, testCase) {
  ruleTester.run("rule", rule, { valid: [], invalid: [testCase] });
}

test("component-own-folder: a component in its own folder passes", () => {
  passes(ownFolder, {
    code: ok,
    filename: P + "/SectionConfirm/SectionConfirm.tsx",
  });
});

test("component-own-folder: a sole-use helper beside its orchestrator passes", () => {
  passes(ownFolder, {
    code: ok,
    filename: P + "/SectionConfirm/OverlayBlocked.tsx",
  });
});

test("component-own-folder: a component colocated under hooks/ passes", () => {
  passes(ownFolder, {
    code: ok,
    filename: S + "/domains/approval/hooks/use-pin-entry/ModalPinEntry.tsx",
  });
});

test("component-own-folder: a .test.tsx directly under components/ is ignored", () => {
  passes(ownFolder, { code: ok, filename: P + "/ModalPinEntry.test.tsx" });
});

test("component-own-folder: a non-.tsx file under components/ is ignored", () => {
  passes(ownFolder, { code: ok, filename: P + "/helpers.ts" });
});

test("component-own-folder: reports a loose component directly under components/", () => {
  reports(ownFolder, {
    code: ok,
    filename: P + "/OverlayBlocked.tsx",
    errors: [{ messageId: "ownFolder" }],
  });
});

test("component-own-folder: reports a loose component under a screen's components/", () => {
  reports(ownFolder, {
    code: ok,
    filename:
      S + "/screens/transfer/TransferHistoryScreen/components/ItemTransfer.tsx",
    errors: [{ messageId: "ownFolder" }],
  });
});

// The message must echo the spelling the file is actually under, or it names a
// directory that does not exist.
test("component-own-folder: reports a loose component under a singular component/", () => {
  reports(ownFolder, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/component/ItemRecent.tsx",
    errors: [
      {
        messageId: "ownFolder",
        data: { file: "ItemRecent.tsx", name: "ItemRecent", dir: "component" },
      },
    ],
  });
});

test("component-own-folder: the plural message still names components/", () => {
  reports(ownFolder, {
    code: ok,
    filename: P + "/OverlayBlocked.tsx",
    errors: [
      {
        messageId: "ownFolder",
        data: {
          file: "OverlayBlocked.tsx",
          name: "OverlayBlocked",
          dir: "components",
        },
      },
    ],
  });
});

test("component-own-folder: an own-folder component under a singular component/ passes", () => {
  passes(ownFolder, {
    code: ok,
    filename:
      S + "/screens/home/HomeScreen/component/ItemRecent/ItemRecent.tsx",
  });
});

test("component-own-folder: a directory merely starting with 'component' is not matched", () => {
  passes(ownFolder, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/component-kit/ChipFilter.tsx",
  });
});

test("hook-file-kebab-case: a kebab-case hook file passes", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/domains/approval/hooks/use-pin-entry.ts",
  });
});

test("hook-file-kebab-case: a kebab-case hook in its own folder passes", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/domains/approval/hooks/use-pin-entry/use-pin-entry.tsx",
  });
});

test("hook-file-kebab-case: a PascalCase helper under hooks/ is not a hook file", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/domains/approval/hooks/use-signing/SignedPayload.ts",
  });
});

test("hook-file-kebab-case: a dotted kebab helper under hooks/ passes", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/domains/approval/hooks/use-signing/use-signing.helper.ts",
  });
});

test("hook-file-kebab-case: a component outside any hooks/ dir is ignored", () => {
  passes(kebabCase, { code: ok, filename: S + "/shared/ui/Card/Card.tsx" });
});

test("hook-file-kebab-case: reports a camelCase hook under a domain", () => {
  reports(kebabCase, {
    code: ok,
    filename: S + "/domains/approval/hooks/useKeyRegistration.ts",
    errors: [{ messageId: "kebab" }],
  });
});

test("hook-file-kebab-case: reports a camelCase hook under a screen", () => {
  reports(kebabCase, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/hooks/useHomeData.ts",
    errors: [{ messageId: "kebab" }],
  });
});

test("hook-file-kebab-case: reports a camelCase hook under a singular hook/", () => {
  reports(kebabCase, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/hook/useBalanceData.ts",
    errors: [{ messageId: "kebab" }],
  });
});

test("hook-file-kebab-case: a kebab-case hook under a singular hook/ passes", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/hook/use-balance-data.ts",
  });
});

test("hook-file-kebab-case: a directory merely starting with 'hook' is not matched", () => {
  passes(kebabCase, {
    code: ok,
    filename: S + "/shared/lib/hookery/useKeyRegistration.ts",
  });
});

for (const [name, why] of [
  ["ButtonNavHome", ""],
  ["ModalErrorApproval", ""],
  ["BottomSheetFilterDate", " (two-word Type)"],
  ["ButtonHeaderRightShare", " (multi-word parts)"],
  ["ModalUnexpected", " (Purpose/Feature inherited from folder)"],
  ["ItemTransfer", ""],
  ["KeypadAmount", ""],
  ["TextContact", ""],
  ["IconChevronRight", ""],
  ["OverlayBlocked", ""],
  ["ViewTransferSummary", ""],
]) {
  test(`component-type-prefix: accepts ${name}${why}`, () => {
    passes(typePrefix, { code: ok, filename: `${P}/${name}.tsx` });
  });
}

test("component-type-prefix: accepts a bare Type as a complete name (Card)", () => {
  passes(typePrefix, { code: ok, filename: P + "/Card.tsx" });
});

test("component-type-prefix: accepts a bare Type as a complete name (Row)", () => {
  passes(typePrefix, { code: ok, filename: P + "/Row.tsx" });
});

test("component-type-prefix: ignores index.tsx", () => {
  passes(typePrefix, { code: ok, filename: P + "/index.tsx" });
});

test("component-type-prefix: ignores a kebab-case filename", () => {
  passes(typePrefix, { code: ok, filename: P + "/use-pin-entry.tsx" });
});

test("component-type-prefix: ignores a .test.tsx", () => {
  passes(typePrefix, {
    code: ok,
    filename: P + "/ApprovalErrorModal.test.tsx",
  });
});

test("component-type-prefix: ignores a .spec.tsx", () => {
  passes(typePrefix, {
    code: ok,
    filename: P + "/ApprovalErrorModal.spec.tsx",
  });
});

test("component-type-prefix: ignores a non-.tsx file", () => {
  passes(typePrefix, { code: ok, filename: P + "/helpers.ts" });
});

test("component-type-prefix: a screen keeps its Screen suffix (TransferReviewScreen)", () => {
  passes(typePrefix, {
    code: ok,
    filename:
      S + "/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
  });
});

test("component-type-prefix: a screen keeps its Screen suffix (HomeScreen)", () => {
  passes(typePrefix, {
    code: ok,
    filename: S + "/screens/home/HomeScreen/HomeScreen.tsx",
  });
});

for (const name of [
  "ApprovalErrorModal",
  "PinEntryModal",
  "BlockedOverlay",
  "TransferHistoryView",
  "SummaryHeader",
  "HelperText",
]) {
  test(`component-type-prefix: rejects ${name} (suffix-style)`, () => {
    reports(typePrefix, {
      code: ok,
      filename: `${P}/${name}.tsx`,
      errors: [{ messageId: "typeSuffix" }],
    });
  });
}

for (const name of ["HomeNavTile", "Grid", "ThemeProvider"]) {
  test(`component-type-prefix: rejects ${name} (no Type anywhere)`, () => {
    reports(typePrefix, {
      code: ok,
      filename: `${P}/${name}.tsx`,
      errors: [{ messageId: "typePrefix" }],
    });
  });
}

test("component-type-prefix: rejects Cardinal — Card is not a word-boundary match", () => {
  reports(typePrefix, {
    code: ok,
    filename: P + "/Cardinal.tsx",
    errors: [{ messageId: "typePrefix" }],
  });
});

// An unregistered rule file enforces nothing while it reads as vendored.
test("every rule file is registered in index.js and resolves", () => {
  const assert = require("node:assert");
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "..");
  const index = require("../index.js");
  const onDisk = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_") && f !== "index.js")
    .map((f) => f.replace(/\.js$/, ""))
    .sort();
  const registered = Object.keys(index.rules).sort();
  assert.deepStrictEqual(
    registered,
    onDisk,
    "index.js and the rule files on disk disagree",
  );
  for (const name of registered) {
    assert.strictEqual(
      typeof index.rules[name].create,
      "function",
      `${name} exports no create()`,
    );
  }
});
