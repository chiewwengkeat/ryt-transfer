"use strict";

const { test } = require("node:test");
const { RuleTester } = require("eslint");
const { mkdtempSync, mkdirSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");

const sibling = require("../sibling-basename-tracks-folder");

// node:test owns reporting and failure now. RuleTester's own describe/it shims
// would catch the assertion throw and log it, leaving the node:test case green.
RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (_name, fn) => fn();

const ruleTester = new RuleTester();
const ok = "const x = 1;";

/** A real directory tree. The rule reads the disk, so a synthetic filename makes
 * every case pass as `valid` and no `invalid` case can ever report — a green,
 * inert suite. */
function tree(files) {
  const root = mkdtempSync(tmpdir() + "/fe-sibling-");
  for (const rel of files) {
    const full = root + "/src/" + rel;
    mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, "");
  }
  return (rel) => root + "/src/" + rel;
}

function passes(testCase) {
  ruleTester.run("sibling-basename-tracks-folder", sibling, {
    valid: [testCase],
    invalid: [],
  });
}
function reports(testCase) {
  ruleTester.run("sibling-basename-tracks-folder", sibling, {
    valid: [],
    invalid: [testCase],
  });
}
const orphan = [{ messageId: "orphanSibling" }];
const noName = [{ messageId: "orphanSiblingNoName" }];

const KEYPAD = "domains/approval/keypad";
const GET_TRANSFER = "domains/transfer/api/get-transfer";

test("sibling: a sibling named for its own folder passes", () => {
  const at = tree([
    "domains/account/components/CardBalance/CardBalance.tsx",
    "domains/account/components/CardBalance/CardBalance.type.ts",
  ]);
  passes({
    code: ok,
    filename: at("domains/account/components/CardBalance/CardBalance.type.ts"),
  });
});

test("sibling: a sibling named for a component beside it passes", () => {
  const at = tree([
    "shared/ui/field-text/field-text.tsx",
    "shared/ui/field-text/adornment.tsx",
    "shared/ui/field-text/adornment.type.ts",
  ]);
  passes({ code: ok, filename: at("shared/ui/field-text/adornment.type.ts") });
});

test("sibling: a kebab folder with a PascalCase component still passes on the folder arm", () => {
  const at = tree([
    "shared/ui/status-pill/PillTransferStatus.tsx",
    "shared/ui/status-pill/status-pill.type.ts",
  ]);
  passes({
    code: ok,
    filename: at("shared/ui/status-pill/status-pill.type.ts"),
  });
});

test("sibling: a PascalCase sibling named for a component beside it passes", () => {
  const at = tree([
    "screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx",
    "screens/transfer/TransferAmountScreen/KeypadAmount.tsx",
    "screens/transfer/TransferAmountScreen/KeypadAmount.type.ts",
  ]);
  passes({
    code: ok,
    filename: at("screens/transfer/TransferAmountScreen/KeypadAmount.type.ts"),
  });
});

test("sibling: a sibling named for a .ts module beside it passes", () => {
  const at = tree([
    "domains/approval/hooks/use-signing/use-signing.ts",
    "domains/approval/hooks/use-signing/use-sign-transfer.ts",
    "domains/approval/hooks/use-signing/use-sign-transfer.type.ts",
  ]);
  passes({
    code: ok,
    filename: at(
      "domains/approval/hooks/use-signing/use-sign-transfer.type.ts",
    ),
  });
});

test("sibling: a folder-named sibling passes with no folder-named .tsx present", () => {
  const at = tree([
    "shared/ui/ButtonAction/ButtonActionPrimary.tsx",
    "shared/ui/ButtonAction/ButtonActionSecondary.tsx",
    "shared/ui/ButtonAction/ButtonAction.style.ts",
  ]);
  passes({
    code: ok,
    filename: at("shared/ui/ButtonAction/ButtonAction.style.ts"),
  });
});

test("sibling: a sibling naming neither the folder nor any module reports", () => {
  const at = tree([
    "screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
    "screens/transfer/TransferReviewScreen/TransferResultScreen.type.ts",
  ]);
  reports({
    code: ok,
    filename: at(
      "screens/transfer/TransferReviewScreen/TransferResultScreen.type.ts",
    ),
    errors: orphan,
  });
});

test("sibling: the message names the free filename the sibling must take", () => {
  const at = tree([
    "screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
    "screens/transfer/TransferReviewScreen/TransferReviewScreen.helper.ts",
    "screens/transfer/TransferReviewScreen/TransferResultScreen.type.ts",
  ]);
  reports({
    code: ok,
    filename: at(
      "screens/transfer/TransferReviewScreen/TransferResultScreen.type.ts",
    ),
    errors: [
      {
        messageId: "orphanSibling",
        data: {
          file: "TransferResultScreen.type.ts",
          stem: "TransferResultScreen",
          parent: "TransferReviewScreen",
          suggestions: "'TransferReviewScreen.type.ts'",
        },
      },
    ],
  });
});

// Prescribing the folder name here would teach a rename onto a live file.
test("sibling: when every name it could take is occupied, the message says so instead", () => {
  const at = tree([
    GET_TRANSFER + "/get-transfer.ts",
    GET_TRANSFER + "/get-transfer.helper.ts",
    GET_TRANSFER + "/get-transfer-merge.helper.ts",
  ]);
  reports({
    code: ok,
    filename: at(GET_TRANSFER + "/get-transfer-merge.helper.ts"),
    errors: noName,
  });
});

test("sibling: the occupied-name message lists the taken filename", () => {
  const at = tree([
    GET_TRANSFER + "/get-transfer.ts",
    GET_TRANSFER + "/get-transfer.helper.ts",
    GET_TRANSFER + "/get-transfer-merge.helper.ts",
  ]);
  reports({
    code: ok,
    filename: at(GET_TRANSFER + "/get-transfer-merge.helper.ts"),
    errors: [
      {
        messageId: "orphanSiblingNoName",
        data: {
          file: "get-transfer-merge.helper.ts",
          stem: "get-transfer-merge",
          taken: "'get-transfer.helper.ts'",
        },
      },
    ],
  });
});

test("sibling: every candidate name is offered when several modules could own it", () => {
  const at = tree([
    KEYPAD + "/keypad.ts",
    KEYPAD + "/reader.tsx",
    KEYPAD + "/stray.type.ts",
  ]);
  reports({
    code: ok,
    filename: at(KEYPAD + "/stray.type.ts"),
    errors: [
      {
        messageId: "orphanSibling",
        data: {
          file: "stray.type.ts",
          stem: "stray",
          parent: "keypad",
          suggestions: "'keypad.type.ts' or 'reader.type.ts'",
        },
      },
    ],
  });
});

// Bounded, or a folder of many components would quote every filename. The second
// name depends on the file system's directory order, so only its shape is asserted.
test("sibling: the suggestion list is bounded, with the folder name first", () => {
  const history = "screens/transfer/TransferHistoryScreen";
  const at = tree([
    history + "/TransferHistoryScreen.tsx",
    history + "/SectionDay.tsx",
    history + "/RowFilter.tsx",
    history + "/BannerOffline.tsx",
    history + "/LoaderMore.tsx",
    history + "/history.helper.ts",
  ]);
  reports({
    code: ok,
    filename: at(history + "/history.helper.ts"),
    errors: [
      {
        message:
          /Rename it to 'TransferHistoryScreen\.helper\.ts' or '[A-Za-z]+\.helper\.ts', or one of 3 other modules here\.$/,
      },
    ],
  });
});

test("sibling: a shared mock directory is not governed", () => {
  const at = tree([
    "test/msw/create-mock-server.ts",
    "test/msw/transfer.mock.ts",
    "test/msw/recipient.mock.ts",
  ]);
  passes({ code: ok, filename: at("test/msw/transfer.mock.ts") });
});

test("sibling: a shared types directory is not governed", () => {
  const at = tree([
    "domains/transfer/types/lookup.type.ts",
    "domains/transfer/types/recipient.type.ts",
  ]);
  passes({ code: ok, filename: at("domains/transfer/types/lookup.type.ts") });
});

test("sibling: a helper directory with no identity of its own is not governed", () => {
  const at = tree([
    "test/scenarios/status.helper.ts",
    "test/scenarios/rows.helper.ts",
    "test/scenarios/outcome.helper.ts",
  ]);
  passes({ code: ok, filename: at("test/scenarios/status.helper.ts") });
});

test("sibling: a directory holding a component is governed even without a folder-named module", () => {
  const at = tree([KEYPAD + "/reader.tsx", KEYPAD + "/stray.type.ts"]);
  reports({
    code: ok,
    filename: at(KEYPAD + "/stray.type.ts"),
    errors: orphan,
  });
});

test("sibling: a directory named after one of its own modules is governed", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/stray.type.ts"]);
  reports({
    code: ok,
    filename: at(KEYPAD + "/stray.type.ts"),
    errors: orphan,
  });
});

test("sibling: an endpoint's own folder is governed by the folder-named module", () => {
  const at = tree([
    GET_TRANSFER + "/get-transfer.ts",
    GET_TRANSFER + "/get-transfer.type.ts",
  ]);
  passes({ code: ok, filename: at(GET_TRANSFER + "/get-transfer.type.ts") });
});

test("sibling: a stray contract inside an endpoint folder reports", () => {
  const at = tree([
    GET_TRANSFER + "/get-transfer.ts",
    GET_TRANSFER + "/approve-transfer.type.ts",
  ]);
  reports({
    code: ok,
    filename: at(GET_TRANSFER + "/approve-transfer.type.ts"),
    errors: orphan,
  });
});

test("sibling: a non-test compound suffix passes on the folder arm", () => {
  const at = tree(["mocks/bank/bank.ts", "mocks/bank/bank.mock.base.ts"]);
  passes({ code: ok, filename: at("mocks/bank/bank.mock.base.ts") });
});

test("sibling: a compound suffix is carried whole into the suggested name", () => {
  const at = tree(["mocks/bank/bank.ts", "mocks/bank/recipient.mock.base.ts"]);
  reports({
    code: ok,
    filename: at("mocks/bank/recipient.mock.base.ts"),
    errors: [
      {
        messageId: "orphanSibling",
        data: {
          file: "recipient.mock.base.ts",
          stem: "recipient",
          parent: "bank",
          suggestions: "'bank.mock.base.ts'",
        },
      },
    ],
  });
});

// A route test is named for the route it exercises, not for the mount helper beside it.
test("sibling: a route test naming neither the folder nor a module passes", () => {
  const at = tree(["test/routes/mount-home.tsx", "test/routes/home.test.tsx"]);
  passes({ code: ok, filename: at("test/routes/home.test.tsx") });
});

test("sibling: a .spec. file is excluded the same way", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/stray.spec.ts"]);
  passes({ code: ok, filename: at(KEYPAD + "/stray.spec.ts") });
});

test("sibling: a compound .helper.test.ts is excluded", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/stray.helper.test.ts"]);
  passes({ code: ok, filename: at(KEYPAD + "/stray.helper.test.ts") });
});

// Read straight from the directory, `stray.type.tsx` would own itself and always pass.
test("sibling: a .tsx sibling does not count as its own owner", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/stray.type.tsx"]);
  reports({
    code: ok,
    filename: at(KEYPAD + "/stray.type.tsx"),
    errors: orphan,
  });
});

test("sibling: a role file owned by another role file sharing its stem passes", () => {
  const at = tree([
    "screens/transfer/state/limits.helper.tsx",
    "screens/transfer/state/limits.type.tsx",
    "screens/transfer/state/use-limits.tsx",
  ]);
  passes({
    code: ok,
    filename: at("screens/transfer/state/limits.helper.tsx"),
  });
});

test("sibling: a non-role dot segment is not a colocated sibling", () => {
  const at = tree(["app/index.tsx", "app/history.tsx", "app/qr.svg.tsx"]);
  passes({ code: ok, filename: at("app/qr.svg.tsx") });
});

test("sibling: a role segment in the same directory shape does report", () => {
  const at = tree(["app/index.tsx", "app/history.tsx", "app/qr.type.tsx"]);
  reports({ code: ok, filename: at("app/qr.type.tsx"), errors: orphan });
});

test("sibling: an unsuffixed module is not a colocated sibling", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/stray.ts"]);
  passes({ code: ok, filename: at(KEYPAD + "/stray.ts") });
});

test("sibling: a .d.ts declaration is not a colocated sibling", () => {
  const at = tree([KEYPAD + "/keypad.ts", KEYPAD + "/env.d.ts"]);
  passes({ code: ok, filename: at(KEYPAD + "/env.d.ts") });
});

test("sibling: an unreadable directory is inert", () => {
  passes({
    code: ok,
    filename: "/repo/src/domains/account/components/CardBalance/Stray.type.ts",
  });
});

// A lone file has nothing to belong to, so there is no evidence either way.
// Reporting would make the verdict flip when an unrelated second file lands.
test("sibling: a lone file in a real directory is inert", () => {
  const at = tree(["domains/transfer/types/transfer.type.ts"]);
  passes({ code: ok, filename: at("domains/transfer/types/transfer.type.ts") });
});

test("sibling: a probe with only its own file on disk is inert", () => {
  const at = tree(["__selftest__/Grid.type.tsx"]);
  passes({ code: ok, filename: at("__selftest__/Grid.type.tsx") });
});

// ESLint hands a rule "<input>" when linting bare --stdin with no filename.
test("sibling: a bare filename with no directory is inert", () => {
  passes({ code: ok, filename: "<input>" });
});
