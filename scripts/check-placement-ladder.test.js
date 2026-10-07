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

function runPlacementCheckOn(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "placement-ladder-"));
  try {
    for (const [file, content] of Object.entries(tree)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, "check-placement-ladder.js"), root],
      {
        encoding: "utf8",
      },
    );
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

test("counts a route that re-exports a domain component as its user", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/account/components/CardBalance/CardBalance.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/app/index.tsx":
      'export { default } from "@/domains/account/components/CardBalance/CardBalance";\n',
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a domain component that only the demo layer's own components use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/transfer/components/PillScenario/PillScenario.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/mocks/components/BottomSheetScenario/BottomSheetScenario.tsx":
      moduleImporting(
        "@/domains/transfer/components/PillScenario/PillScenario",
      ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("ignores shared code, which holds no placement subjects", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ButtonPrimary/ButtonPrimary.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});
