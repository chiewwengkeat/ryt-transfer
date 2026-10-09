const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const PLACEHOLDER_COMPONENT_SOURCE =
  "export default function Placeholder() {\n  return null;\n}\n";
const moduleImporting = (...specifiers) =>
  specifiers
    .map((specifier, i) => `import * as Imported${i} from "${specifier}";\n`)
    .join("");

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

const AMOUNT_SCREEN_FILE =
  "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx";

test("fails a screens-folder hook that one screen uses, naming that screen's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/hooks/use-transfer-limits.ts":
      "export function useTransferLimits() {\n  return null;\n}\n",
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      moduleImporting("@/screens/transfer/hooks/use-transfer-limits"),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferAmountScreen\/hooks\/$/m,
  );
});

const BUTTON_PRIMARY_FILE = "src/shared/ui/ButtonPrimary/ButtonPrimary.tsx";
const SHARED_UI_HOOK_FILE = "src/shared/ui/hooks/use-press-scale.ts";
const PRESS_SCALE_HOOK_SOURCE =
  "export function usePressScale() {\n  return 1;\n}\n";

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
  assert.match(errors, /use-press-scale\.ts: no app code uses it/);
});

test("fails a shared/ui hook that one base component uses, naming that component's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [SHARED_UI_HOOK_FILE]: PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting("@/shared/ui/hooks/use-press-scale"),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /belongs in src\/shared\/ui\/ButtonPrimary\/hooks\/$/m);
});

test("passes a base component's own hook in its hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ButtonPrimary/hooks/use-press-scale.ts":
      PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting("./hooks/use-press-scale"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a shared/ui hook that two base components use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [SHARED_UI_HOOK_FILE]: PRESS_SCALE_HOOK_SOURCE,
    [BUTTON_PRIMARY_FILE]: moduleImporting("@/shared/ui/hooks/use-press-scale"),
    "src/shared/ui/FieldText/FieldText.tsx": moduleImporting(
      "@/shared/ui/hooks/use-press-scale",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const KEYBOARD_HOOK_FILE = "src/shared/hooks/use-keyboard-height.ts";
const KEYBOARD_HOOK_SOURCE =
  "export function useKeyboardHeight() {\n  return 0;\n}\n";

test("fails a shared hook that nothing uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /use-keyboard-height\.ts: no app code uses it/);
});

test("fails a shared hook that one screen uses, naming that screen's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
    [AMOUNT_SCREEN_FILE]: moduleImporting("@/shared/hooks/use-keyboard-height"),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferAmountScreen\/hooks\/$/m,
  );
});

const keyboardHookUser = moduleImporting("@/shared/hooks/use-keyboard-height");
const domainHooksUser = moduleImporting(
  "@/domains/transfer/hooks/use-status-checker",
  "@/domains/approval/hooks/use-resend-timer",
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
    "the shell and one screens folder",
    {
      "src/shell/ViewLaunchRecovery/ViewLaunchRecovery.tsx": keyboardHookUser,
      [AMOUNT_SCREEN_FILE]: keyboardHookUser,
    },
  ],
  [
    "two domains, which cannot import each other",
    {
      "src/domains/transfer/hooks/use-status-checker.ts": keyboardHookUser,
      "src/domains/approval/hooks/use-resend-timer.ts": keyboardHookUser,
      "src/screens/home/HomeScreen/HomeScreen.tsx": domainHooksUser,
      "src/shell/OverlayPinSheet/OverlayPinSheet.tsx": domainHooksUser,
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

test("fails a shared hook that only the shell uses, naming src/shell/", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [KEYBOARD_HOOK_FILE]: KEYBOARD_HOOK_SOURCE,
    "src/shell/ViewLaunchRecovery/ViewLaunchRecovery.tsx": keyboardHookUser,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /use-keyboard-height\.ts: only the shell uses it .* - it belongs in src\/shell\/$/m,
  );
});

test("passes a domain hook that only the shell uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/hooks/use-resend-timer.ts":
      "export function useResendTimer() {\n  return null;\n}\n",
    "src/shell/OverlayPinSheet/OverlayPinSheet.tsx": moduleImporting(
      "@/domains/approval/hooks/use-resend-timer",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a domain hook that only one domain component uses, naming that component's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/hooks/use-pin-entry.ts":
      "export function usePinEntry() {\n  return null;\n}\n",
    "src/domains/approval/components/BottomSheetPin/BottomSheetPin.tsx":
      moduleImporting("@/domains/approval/hooks/use-pin-entry"),
    "src/shell/OverlayPinSheet/OverlayPinSheet.tsx": moduleImporting(
      "@/domains/approval/components/BottomSheetPin/BottomSheetPin",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/domains\/approval\/components\/BottomSheetPin\/hooks\/$/m,
  );
});
