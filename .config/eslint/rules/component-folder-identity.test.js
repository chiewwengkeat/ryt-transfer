"use strict";

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { mkdtempSync, mkdirSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const rule = require("./component-folder-identity");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

test("folder-identity: a component in a folder of its own name passes", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/CardBalance/CardBalance.tsx") });
});

test("folder-identity: a .ts file is not a component and passes", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/Wrong/card-balance.helper.ts") });
});

test("folder-identity: a .test.tsx passes", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/Wrong/CardBalance.test.tsx") });
});

test("folder-identity: a .spec.tsx passes", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/Wrong/CardBalance.spec.tsx") });
});

// The remedy for this file is 'rename it to Wrong.type.tsx', which is
// sibling-basename-tracks-folder's message. Reporting here would contradict it.
test("folder-identity: a dot-suffixed .tsx is left to sibling-basename-tracks-folder", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/Wrong/CardBalance.type.tsx") });
});

// Engaged by a PascalCase filename, never by the export: component-type-prefix owns a
// kebab-case file.
test("folder-identity: a kebab-cased component file passes", () => {
  passes({
    code: ok,
    filename: at(ACCOUNT + "/card-balance/card-balance.tsx"),
  });
});

test("folder-identity: index.tsx passes", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/CardBalance/index.tsx") });
});

test("folder-identity: a component directly under components/ is left to component-own-folder", () => {
  passes({ code: ok, filename: at(ACCOUNT + "/CardBalance.tsx") });
});

test("folder-identity: a component directly under singular component/ is left alone too", () => {
  passes({ code: ok, filename: at("src/component/CardBalance.tsx") });
});

test("folder-identity: a file under src/app/ is a route and passes", () => {
  passes({ code: ok, filename: at("src/app/transfer/Review.tsx") });
});

test("folder-identity: a file with no directory at all passes", () => {
  passes({ code: ok, filename: "CardBalance.tsx" });
});

test("folder-identity: a PascalCase component in a kebab folder reports", () => {
  reports({
    code: ok,
    filename: at(
      "src/screens/transfer/components/section-transfer-details/SectionTransferDetails.tsx",
    ),
    errors: identity,
  });
});

test("folder-identity: the rule fires everywhere, not only inside a components/ tree", () => {
  reports({
    code: ok,
    filename: at("src/a/b/c/Wrong/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: a folder differing only in case reports", () => {
  reports({
    code: ok,
    filename: at(ACCOUNT + "/cardbalance/CardBalance.tsx"),
    errors: identity,
  });
});

test("folder-identity: a folder named app outside src/app/ is not a route", () => {
  reports({
    code: ok,
    filename:
      "/home/app/ryt-transfer/src/domains/account/components/Wrong/Grid.tsx",
    errors: identity,
  });
});

// No tree on disk, as for an unsaved buffer or `--stdin`: the rule must still fire,
// as folderIdentity.
test("folder-identity: with no directory readable the rule still fires, as folderIdentity", () => {
  reports({
    code: ok,
    filename: at("src/__selftest__/CardThing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: the folderIdentity message names the folder and the component", () => {
  reports({
    code: ok,
    filename: at(
      "src/screens/transfer/components/section-transfer-details/SectionTransferDetails.tsx",
    ),
    errors: [
      {
        messageId: "folderIdentity",
        data: {
          file: "SectionTransferDetails.tsx",
          parent: "section-transfer-details",
          stem: "SectionTransferDetails",
        },
      },
    ],
  });
});

test("folder-identity: a component beside the folder's own component is a flat child", () => {
  const to = tree([
    "account/CardBalance/CardBalance.tsx",
    "account/CardBalance/Badge.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/CardBalance/Badge.tsx"),
    errors: child,
  });
});

test("folder-identity: a flat child of a kebab-named component is still a child", () => {
  const to = tree([
    "account/card-thing/card-thing.tsx",
    "account/card-thing/Grid.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: child,
  });
});

test("folder-identity: two components in a folder named for neither are both children", () => {
  const to = tree([
    "account/card-thing/Grid.tsx",
    "account/card-thing/Badge.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: child,
  });
});

test("folder-identity: the childOwnFolder message names the components/ destination", () => {
  const to = tree([
    "account/CardBalance/CardBalance.tsx",
    "account/CardBalance/Badge.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/CardBalance/Badge.tsx"),
    errors: [
      {
        messageId: "childOwnFolder",
        data: { file: "Badge.tsx", parent: "CardBalance", stem: "Badge" },
      },
    ],
  });
});

// These pin the rule's self filter: without it every lone component reads as a flat
// child of itself.
test("folder-identity: a lone component in a misnamed folder is not its own sibling", () => {
  const to = tree(["account/card-thing/Grid.tsx"]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: colocated non-component siblings do not make it a child", () => {
  const to = tree([
    "account/card-thing/Grid.tsx",
    "account/card-thing/grid.helper.ts",
    "account/card-thing/Grid.style.ts",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: a sibling test file does not make it a child", () => {
  const to = tree([
    "account/card-thing/Grid.tsx",
    "account/card-thing/Grid.test.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: a dot-suffixed sibling .tsx does not make it a child", () => {
  const to = tree([
    "account/card-thing/Grid.tsx",
    "account/card-thing/Other.type.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: a kebab-named sibling .tsx that is not the folder's own does not make it a child", () => {
  const to = tree([
    "account/card-thing/Grid.tsx",
    "account/card-thing/legacy-tile.tsx",
  ]);
  reports({
    code: ok,
    filename: to("account/card-thing/Grid.tsx"),
    errors: identity,
  });
});

test("folder-identity: a matching folder passes even with other components beside it", () => {
  const to = tree([
    "account/CardBalance/CardBalance.tsx",
    "account/CardBalance/Badge.tsx",
  ]);
  passes({ code: ok, filename: to("account/CardBalance/CardBalance.tsx") });
});

test("folder-identity: a component directly under components/ passes with siblings present", () => {
  const to = tree(["components/CardBalance.tsx", "components/Badge.tsx"]);
  passes({ code: ok, filename: to("components/CardBalance.tsx") });
});

const ruleTester = new RuleTester();
const ok = "const x = 1;";

/** Synthetic paths suffice wherever only the filename decides: dirEntries reads [] for
 * them, so the message is always folderIdentity, as for an unsaved buffer or `--stdin`. */
const at = (rel) => "/tmp/repo/" + rel;

/** A real tree, for the cases that decide WHICH message. */
function tree(files) {
  const root = mkdtempSync(tmpdir() + "/fe-folder-identity-");
  for (const rel of files) {
    const full = root + "/src/" + rel;
    mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, "");
  }
  return (rel) => root + "/src/" + rel;
}

function passes(testCase) {
  ruleTester.run("component-folder-identity", rule, {
    valid: [testCase],
    invalid: [],
  });
}
function reports(testCase) {
  ruleTester.run("component-folder-identity", rule, {
    valid: [],
    invalid: [testCase],
  });
}
const identity = [{ messageId: "folderIdentity" }];
const child = [{ messageId: "childOwnFolder" }];

const ACCOUNT = "src/domains/account/components";
