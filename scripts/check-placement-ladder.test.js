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

function runStagedPlacementCheckOn({
  staged,
  workingTreeOnly = {},
  deletionsStaged = [],
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "placement-staged-"));
  // Inside a hook or a rebase, git exports variables that would aim these commands at this repo.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const run = (command, args) =>
    spawnSync(command, args, { cwd: root, env, encoding: "utf8" });
  try {
    run("git", ["init", "-q"]);
    writeTree(root, staged);
    run("git", ["add", "--all"]);
    for (const file of deletionsStaged)
      run("git", ["rm", "-q", "--cached", file]);
    writeTree(root, workingTreeOnly);
    const result = run(process.execPath, [CHECK_SCRIPT, "--staged"]);
    return { exitCode: result.status, errors: result.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const RECEIPT_SECTION =
  "src/screens/transfer/components/SectionTransferDetails/SectionTransferDetails.tsx";

test("fails a screens-folder component that only one screen uses, naming that screen's folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      moduleImporting(
        "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
      ),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferResultScreen\/components\/$/m,
  );
});

test("passes a screens-folder component that two screens of that folder use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      moduleImporting(
        "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
      ),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.tsx":
      moduleImporting(
        "../components/SectionTransferDetails/SectionTransferDetails",
      ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const HISTORY_SCREEN_DIR = "src/screens/transfer/TransferHistoryScreen";

test("fails a screen's component that only a sibling component uses, naming the sibling's folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [`${HISTORY_SCREEN_DIR}/TransferHistoryScreen.tsx`]: moduleImporting(
      "./components/SectionTransferAccordion/SectionTransferAccordion",
    ),
    [`${HISTORY_SCREEN_DIR}/components/SectionTransferAccordion/SectionTransferAccordion.tsx`]:
      moduleImporting("../ItemTransfer/ItemTransfer"),
    [`${HISTORY_SCREEN_DIR}/components/ItemTransfer/ItemTransfer.tsx`]:
      PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferHistoryScreen\/components\/SectionTransferAccordion\/components\/$/m,
  );
});

test("passes that component once it nests inside the sibling that uses it", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [`${HISTORY_SCREEN_DIR}/TransferHistoryScreen.tsx`]: moduleImporting(
      "./components/SectionTransferAccordion/SectionTransferAccordion",
    ),
    [`${HISTORY_SCREEN_DIR}/components/SectionTransferAccordion/SectionTransferAccordion.tsx`]:
      moduleImporting("./components/ItemTransfer/ItemTransfer"),
    [`${HISTORY_SCREEN_DIR}/components/SectionTransferAccordion/components/ItemTransfer/ItemTransfer.tsx`]:
      PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const RECENTS_COMPONENT_FILE =
  "src/domains/transfer/components/SectionRecents/SectionRecents.tsx";

test("fails a domain component that one screens folder uses, naming the screen that uses it", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECENTS_COMPONENT_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/home/HomeScreen/HomeScreen.tsx": moduleImporting(
      "@/domains/transfer/components/SectionRecents/SectionRecents",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/home\/HomeScreen\/components\/$/m,
  );
});

test("passes a domain component that two screens folders use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECENTS_COMPONENT_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/home/HomeScreen/HomeScreen.tsx": moduleImporting(
      "@/domains/transfer/components/SectionRecents/SectionRecents",
    ),
    "src/screens/transfer/TransferRecipientScreen/TransferRecipientScreen.tsx":
      moduleImporting(
        "@/domains/transfer/components/SectionRecents/SectionRecents",
      ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a domain component that only the shell uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/components/BottomSheetPin/BottomSheetPin.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/shell/OverlayPinSheet/OverlayPinSheet.tsx": moduleImporting(
      "@/domains/approval/components/BottomSheetPin/BottomSheetPin",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a screens-folder component used from outside the screens folders, naming the domain level", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/shell/ViewLaunchRecovery/ViewLaunchRecovery.tsx": moduleImporting(
      "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /belongs in src\/domains\/<area>\/components\/$/m);
});

test("fails a component whose only importers are tests", () => {
  const fieldAmountDir =
    "src/screens/transfer/TransferAmountScreen/components/FieldAmount";
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.test.tsx":
      moduleImporting("./components/FieldAmount/FieldAmount"),
    [`${fieldAmountDir}/FieldAmount.tsx`]: PLACEHOLDER_COMPONENT_SOURCE,
    [`${fieldAmountDir}/FieldAmount.test.tsx`]:
      moduleImporting("./FieldAmount"),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /FieldAmount: no app code uses it/);
});

test("counts no .spec or __tests__ importer as a user, since Jest runs both as tests", () => {
  const amountScreenDir = "src/screens/transfer/TransferAmountScreen";
  const { exitCode, errors } = runPlacementCheckOn({
    [`${amountScreenDir}/TransferAmountScreen.tsx`]:
      PLACEHOLDER_COMPONENT_SOURCE,
    [`${amountScreenDir}/TransferAmountScreen.spec.tsx`]: moduleImporting(
      "./components/FieldAmount/FieldAmount",
    ),
    [`${amountScreenDir}/__tests__/amount-entry.tsx`]: moduleImporting(
      "../components/FieldAmount/FieldAmount",
    ),
    [`${amountScreenDir}/components/FieldAmount/FieldAmount.tsx`]:
      PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /FieldAmount: no app code uses it/);
});

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

test("counts the users that reach a component through a re-export outside its folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/components/BannerOffline/BannerOffline.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/components/index.ts":
      'export { default as BannerOffline } from "./BannerOffline/BannerOffline";\n',
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      moduleImporting("@/screens/transfer/components"),
    "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx":
      moduleImporting("@/screens/transfer/components"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const AMOUNT_SCREEN_FILE =
  "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx";
const FIELD_AMOUNT_FILE =
  "src/screens/transfer/TransferAmountScreen/components/FieldAmount/FieldAmount.tsx";
const screenRendering = (importLine) =>
  `${importLine}\n\nexport default function TransferAmountScreen() {\n  return FieldAmount;\n}\n`;

for (const [form, importLine, extraFiles] of [
  [
    "an import-equals require",
    'import FieldAmount = require("./components/FieldAmount/FieldAmount");',
    {},
  ],
  [
    "a .js suffix naming the .tsx file",
    'import FieldAmount from "./components/FieldAmount/FieldAmount.js";',
    {},
  ],
  [
    "an @/ path that steps back with ../",
    'import FieldAmount from "@/screens/transfer/components/../TransferAmountScreen/components/FieldAmount/FieldAmount";',
    {},
  ],
  [
    "a folder import with a trailing slash",
    'import FieldAmount from "./components/FieldAmount/";',
    {
      "src/screens/transfer/TransferAmountScreen/components/FieldAmount/index.ts":
        'export { default } from "./FieldAmount";\n',
    },
  ],
]) {
  test(`follows ${form} to the component it names`, () => {
    const { exitCode, errors } = runPlacementCheckOn({
      [AMOUNT_SCREEN_FILE]: screenRendering(importLine),
      [FIELD_AMOUNT_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
      ...extraFiles,
    });
    assert.equal(errors, "");
    assert.equal(exitCode, 0);
  });
}

test("counts an importer under modules/ as a user outside the screens folders", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECENTS_COMPONENT_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/home/HomeScreen/HomeScreen.tsx": moduleImporting(
      "@/domains/transfer/components/SectionRecents/SectionRecents",
    ),
    "modules/recents-widget/index.ts": moduleImporting(
      "../../src/domains/transfer/components/SectionRecents/SectionRecents",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("counts the final importers behind a file that imports a component and exports it again", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/components/BannerOffline/BannerOffline.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/components/index.ts":
      'import BannerOffline from "./BannerOffline/BannerOffline";\n\nexport { BannerOffline };\n',
    [AMOUNT_SCREEN_FILE]: moduleImporting("@/screens/transfer/components"),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /BannerOffline: every user sits in src\/screens\/transfer\/TransferAmountScreen\//,
  );
});

const CARD_TRANSFER_FILE =
  "src/screens/transfer/components/CardTransfer/CardTransfer.tsx";
const CARDS_STATE_FILE = "src/screens/transfer/state/cards.ts";
const CARDS_STATE_SOURCE =
  'import CardTransfer from "../components/CardTransfer/CardTransfer";\n\nexport const Card = CardTransfer;\n';
const cardsStateUser = moduleImporting("@/screens/transfer/state/cards");

test("counts the final importers behind a file that exports an imported component as a const", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [CARD_TRANSFER_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    [CARDS_STATE_FILE]: CARDS_STATE_SOURCE,
    "src/screens/home/HomeScreen/HomeScreen.tsx": cardsStateUser,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /CardTransfer: every user sits in src\/screens\/home\/HomeScreen\//,
  );
});

test("passes a component that two screens reach through a const export", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [CARD_TRANSFER_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    [CARDS_STATE_FILE]: CARDS_STATE_SOURCE,
    [AMOUNT_SCREEN_FILE]: cardsStateUser,
    "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx":
      cardsStateUser,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("counts no story or test utility as a user", () => {
  const receiptSpecifier =
    "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails";
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      moduleImporting(receiptSpecifier),
    "src/screens/transfer/TransferDetailsScreen/test-utils.tsx":
      moduleImporting(receiptSpecifier),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.stories.tsx":
      moduleImporting(receiptSpecifier),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferResultScreen\/components\/$/m,
  );
});

for (const [entry, file] of [
  [
    "a folder in a screens folder that the design does not name",
    "src/screens/transfer/widgets/BannerOffline/BannerOffline.tsx",
  ],
  [
    "a file directly inside a screens folder",
    "src/screens/transfer/use-flow-guard.ts",
  ],
  [
    "a folder in a domain that the design does not name",
    "src/domains/transfer/utils/format-amount.ts",
  ],
  [
    "a scenarios folder outside the transfer screens folder",
    "src/screens/home/scenarios/home.md",
  ],
]) {
  test(`fails ${entry}`, () => {
    const { exitCode, errors } = runPlacementCheckOn({
      [file]: PLACEHOLDER_COMPONENT_SOURCE,
    });
    assert.equal(exitCode, 1);
    assert.match(errors, /: a (screens folder|domain) holds only /);
  });
}

test("passes every folder the design names inside a screens folder and a domain", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/scenarios/transfer.md": "# Scenarios\n",
    "src/screens/transfer/state/flow-store.ts":
      "export const flowStore = {};\n",
    "src/screens/transfer/i18n/en-MY.json": "{}\n",
    "src/domains/transfer/api/transfer.keys.ts": "export const keys = {};\n",
    "src/domains/transfer/i18n/en-MY.json": "{}\n",
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a component whose only user is a route, since a route re-exports a screen", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/account/components/CardBalance/CardBalance.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/app/index.tsx":
      'export { default } from "@/domains/account/components/CardBalance/CardBalance";\n',
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /CardBalance: only a route uses it/);
});

const PILL_SCENARIO_FILE =
  "src/domains/transfer/components/PillScenario/PillScenario.tsx";
const PILL_SCENARIO_SPECIFIER =
  "@/domains/transfer/components/PillScenario/PillScenario";

test("fails a domain component that only the demo layer uses, naming src/mocks/", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [PILL_SCENARIO_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/mocks/components/BottomSheetScenario/BottomSheetScenario.tsx":
      moduleImporting(PILL_SCENARIO_SPECIFIER),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /it belongs in src\/mocks\/$/m);
});

test("passes a domain component that the demo layer and one screens folder use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [PILL_SCENARIO_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/mocks/components/BottomSheetScenario/BottomSheetScenario.tsx":
      moduleImporting(PILL_SCENARIO_SPECIFIER),
    "src/screens/home/HomeScreen/HomeScreen.tsx": moduleImporting(
      PILL_SCENARIO_SPECIFIER,
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("ignores shared/ui, where base components wait for their first screen", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ButtonPrimary/ButtonPrimary.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
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

test("counts a type-only import as a user", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: PLACEHOLDER_COMPONENT_SOURCE,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      moduleImporting(
        "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
      ),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.tsx":
      'import type Receipt from "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails";\n\nexport type Shown = typeof Receipt;\n',
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const amountScreenWithField = {
  [AMOUNT_SCREEN_FILE]: screenRendering(
    'import FieldAmount from "./components/FieldAmount/FieldAmount";',
  ),
  [FIELD_AMOUNT_FILE]: PLACEHOLDER_COMPONENT_SOURCE,
};

test("fails a commit that stages a component while its user stays unstaged", () => {
  const { exitCode, errors } = runStagedPlacementCheckOn({
    staged: { [FIELD_AMOUNT_FILE]: PLACEHOLDER_COMPONENT_SOURCE },
    workingTreeOnly: {
      [AMOUNT_SCREEN_FILE]: amountScreenWithField[AMOUNT_SCREEN_FILE],
    },
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /FieldAmount: no app code uses it/);
});

test("passes a commit whose staged tree is placed right, whatever lies unstaged", () => {
  const { exitCode, errors } = runStagedPlacementCheckOn({
    staged: amountScreenWithField,
    workingTreeOnly: { [RECENTS_COMPONENT_FILE]: PLACEHOLDER_COMPONENT_SOURCE },
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a commit that only deletes a component's last user", () => {
  const { exitCode, errors } = runStagedPlacementCheckOn({
    staged: amountScreenWithField,
    deletionsStaged: [AMOUNT_SCREEN_FILE],
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /FieldAmount: no app code uses it/);
});
