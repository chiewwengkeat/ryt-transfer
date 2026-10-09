const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const moduleImporting = (...specifiers) =>
  specifiers
    .map((specifier, i) => `import * as Imported${i} from "${specifier}";\n`)
    .join("");

const AMOUNT_SCREEN_FILE =
  "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx";
const ROOT_VIEW_FILE = "src/root/ViewRoot/ViewRoot.tsx";

test("fails a screens-folder hook that one screen uses, naming that screen's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/hooks/use-transfer-limits/use-transfer-limits.ts":
      "export function useTransferLimits() {\n  return null;\n}\n",
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      moduleImporting(
        "@/screens/transfer/hooks/use-transfer-limits/use-transfer-limits",
      ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferAmountScreen\/hooks\/$/m,
  );
});

test("passes a base component in shared/ui that no screen uses yet", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [BUTTON_PRIMARY_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a hook directly under shared/ui that nothing uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [SHARED_UI_HOOK_FILE]: PRESS_SCALE_HOOK_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /use-press-scale: no app code uses it/);
});

test("fails a shared/ui hook that one base component uses, naming that component's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [SHARED_UI_HOOK_FILE]: PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting(SHARED_UI_HOOK_PATH),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /belongs in src\/shared\/ui\/ButtonPrimary\/hooks\/$/m);
});

test("passes a base component's own hook in its hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ButtonPrimary/hooks/use-press-scale/use-press-scale.ts":
      PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting(
      "./hooks/use-press-scale/use-press-scale",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a shared/ui hook that two base components use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [SHARED_UI_HOOK_FILE]: PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting(SHARED_UI_HOOK_PATH),
    "src/shared/ui/FieldText/FieldText.tsx":
      moduleImporting(SHARED_UI_HOOK_PATH),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a shared hook that nothing uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /use-keyboard-height: no app code uses it/);
});

test("fails a shared hook that one screen uses, naming that screen's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
    [AMOUNT_SCREEN_FILE]: moduleImporting(
      "@/shared/hooks/use-keyboard-height/use-keyboard-height",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferAmountScreen\/hooks\/$/m,
  );
});

const keyboardHookUser = moduleImporting(
  "@/shared/hooks/use-keyboard-height/use-keyboard-height",
);
const domainHooksUser = moduleImporting(
  "@/domains/transfer/hooks/use-status-checker/use-status-checker",
  "@/domains/approval/hooks/use-resend-timer/use-resend-timer",
);

for (const [users, tree] of [
  [
    "two screens folders",
    {
      [AMOUNT_SCREEN_FILE]: keyboardHookUser,
      "src/screens/home/HomeScreen/HomeScreen.tsx": keyboardHookUser,
    },
  ],
  [
    "the root and one screens folder",
    {
      [ROOT_VIEW_FILE]: keyboardHookUser,
      [AMOUNT_SCREEN_FILE]: keyboardHookUser,
    },
  ],
  [
    "two domains, which cannot import each other",
    {
      "src/domains/transfer/hooks/use-status-checker/use-status-checker.ts":
        keyboardHookUser,
      "src/domains/approval/hooks/use-resend-timer/use-resend-timer.ts":
        keyboardHookUser,
      "src/screens/home/HomeScreen/HomeScreen.tsx": domainHooksUser,
      [ROOT_VIEW_FILE]: domainHooksUser,
    },
  ],
]) {
  test(`passes a shared hook that ${users} use`, () => {
    const { exitCode, errors } = runPlacementCheckOn({
      [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
      ...tree,
    });
    assert.equal(errors, "");
    assert.equal(exitCode, 0);
  });
}

test("fails a shared hook that only the root view uses, naming the root view's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
    [ROOT_VIEW_FILE]: keyboardHookUser,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /use-keyboard-height: every user sits in src\/root\/ViewRoot\/ .* - it belongs in src\/root\/ViewRoot\/hooks\/$/m,
  );
});

test("passes a domain hook that only the root uses, when its files import that domain", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/hooks/use-resend-timer/use-resend-timer.ts":
      moduleImporting("@/domains/approval/api/approval.keys"),
    "src/domains/approval/api/approval.keys.ts": "export const keys = {};\n",
    [ROOT_VIEW_FILE]: moduleImporting(
      "@/domains/approval/hooks/use-resend-timer/use-resend-timer",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a domain hook that only one domain component uses, naming that component's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/hooks/use-pin-entry/use-pin-entry.ts":
      "export function usePinEntry() {\n  return null;\n}\n",
    "src/domains/approval/components/BottomSheetPin/BottomSheetPin.tsx":
      moduleImporting("@/domains/approval/hooks/use-pin-entry/use-pin-entry"),
    [ROOT_VIEW_FILE]: moduleImporting(
      "@/domains/approval/components/BottomSheetPin/BottomSheetPin",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/domains\/approval\/components\/BottomSheetPin\/hooks\/$/m,
  );
});

test("fails a screens-folder lib module that one screen uses, naming that screen's lib folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [TRANSFER_LIMITS_FILE]: TRANSFER_LIMITS_SOURCE,
    [AMOUNT_SCREEN_FILE]: moduleImporting(
      "@/screens/transfer/lib/transfer-limits/transfer-limits",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /transfer-limits: every user sits in .* - it belongs in src\/screens\/transfer\/TransferAmountScreen\/lib\/$/m,
  );
});

test("passes a domain lib module that two screens folders use", () => {
  const limitsUser = moduleImporting(
    "@/domains/transfer/lib/transfer-limits/transfer-limits",
  );
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/transfer/lib/transfer-limits/transfer-limits.ts":
      TRANSFER_LIMITS_SOURCE,
    [AMOUNT_SCREEN_FILE]: limitsUser,
    "src/screens/home/HomeScreen/HomeScreen.tsx": limitsUser,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const PLACEHOLDER_COMPONENT_SOURCE =
  "export default function Placeholder() {\n  return null;\n}\n";

const CHECK_SCRIPT = path.join(__dirname, "check-placement-ladder.js");

function writeTree(root, tree) {
  for (const [file, content] of Object.entries(tree)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}

function runPlacementCheckOn(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "placement-ladder-"));
  try {
    writeTree(root, tree);
    const result = spawnSync(process.execPath, [CHECK_SCRIPT, root], {
      encoding: "utf8",
    });
    return { exitCode: result.status, errors: result.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const BUTTON_PRIMARY_FILE = "src/shared/ui/ButtonPrimary/ButtonPrimary.tsx";
const SHARED_UI_HOOK_FILE =
  "src/shared/ui/hooks/use-press-scale/use-press-scale.ts";
const SHARED_UI_HOOK_PATH = "@/shared/ui/hooks/use-press-scale/use-press-scale";
const PRESS_SCALE_HOOK_SOURCE =
  "export function usePressScale() {\n  return 1;\n}\n";

const KEYBOARD_HOOK_FILE =
  "src/shared/hooks/use-keyboard-height/use-keyboard-height.ts";
const KEYBOARD_HOOK_SOURCE =
  "export function useKeyboardHeight() {\n  return 0;\n}\n";

const TRANSFER_LIMITS_FILE =
  "src/screens/transfer/lib/transfer-limits/transfer-limits.ts";
const TRANSFER_LIMITS_SOURCE = "export const transferLimits = {};\n";
