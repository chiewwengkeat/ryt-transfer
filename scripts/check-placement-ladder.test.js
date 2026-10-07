const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const COMPONENT =
  "export default function Placeholder() {\n  return null;\n}\n";
const importing = (...specifiers) =>
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
    [RECEIPT_SECTION]: COMPONENT,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      importing(
        "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
      ),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.tsx":
      COMPONENT,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferResultScreen\/components\/$/m,
  );
});

test("passes a screens-folder component that two screens of that folder use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: COMPONENT,
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      importing(
        "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
      ),
    "src/screens/transfer/TransferDetailsScreen/TransferDetailsScreen.tsx":
      importing("../components/SectionTransferDetails/SectionTransferDetails"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const HISTORY = "src/screens/transfer/TransferHistoryScreen";

test("fails a screen's component that only a sibling component uses, naming the sibling's folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [`${HISTORY}/TransferHistoryScreen.tsx`]: importing(
      "./components/SectionTransferAccordion/SectionTransferAccordion",
    ),
    [`${HISTORY}/components/SectionTransferAccordion/SectionTransferAccordion.tsx`]:
      importing("../ItemTransfer/ItemTransfer"),
    [`${HISTORY}/components/ItemTransfer/ItemTransfer.tsx`]: COMPONENT,
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /belongs in src\/screens\/transfer\/TransferHistoryScreen\/components\/SectionTransferAccordion\/components\/$/m,
  );
});

test("passes that component once it nests inside the sibling that uses it", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [`${HISTORY}/TransferHistoryScreen.tsx`]: importing(
      "./components/SectionTransferAccordion/SectionTransferAccordion",
    ),
    [`${HISTORY}/components/SectionTransferAccordion/SectionTransferAccordion.tsx`]:
      importing("./components/ItemTransfer/ItemTransfer"),
    [`${HISTORY}/components/SectionTransferAccordion/components/ItemTransfer/ItemTransfer.tsx`]:
      COMPONENT,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const RECENTS = "src/domains/transfer/components/ListRecents/ListRecents.tsx";

test("fails a domain component that one screens folder uses, naming the screen that uses it", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECENTS]: COMPONENT,
    "src/screens/home/HomeScreen/HomeScreen.tsx": importing(
      "@/domains/transfer/components/ListRecents/ListRecents",
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
    [RECENTS]: COMPONENT,
    "src/screens/home/HomeScreen/HomeScreen.tsx": importing(
      "@/domains/transfer/components/ListRecents/ListRecents",
    ),
    "src/screens/transfer/TransferRecipientScreen/TransferRecipientScreen.tsx":
      importing("@/domains/transfer/components/ListRecents/ListRecents"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a domain component that only the shell uses", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/approval/components/BottomSheetPin/BottomSheetPin.tsx":
      COMPONENT,
    "src/shell/pin-sheet-host.tsx": importing(
      "@/domains/approval/components/BottomSheetPin/BottomSheetPin",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a screens-folder component used from outside the screens folders, naming the domain level", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [RECEIPT_SECTION]: COMPONENT,
    "src/shell/launch-recovery.tsx": importing(
      "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails",
    ),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /belongs in src\/domains\/<area>\/components\/$/m);
});

test("fails a component whose only importers are tests", () => {
  const field =
    "src/screens/transfer/TransferAmountScreen/components/FieldAmount";
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      COMPONENT,
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.test.tsx":
      importing("./components/FieldAmount/FieldAmount"),
    [`${field}/FieldAmount.tsx`]: COMPONENT,
    [`${field}/FieldAmount.test.tsx`]: importing("./FieldAmount"),
  });
  assert.equal(exitCode, 1);
  assert.match(errors, /FieldAmount: no app code uses it/);
});

test("fails a screens-folder hook that one screen uses, naming that screen's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/hooks/use-transfer-limits.ts":
      "export function useTransferLimits() {\n  return null;\n}\n",
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      importing("@/screens/transfer/hooks/use-transfer-limits"),
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
      COMPONENT,
    "src/screens/transfer/components/index.ts":
      'export { default as BannerOffline } from "./BannerOffline/BannerOffline";\n',
    "src/screens/transfer/TransferAmountScreen/TransferAmountScreen.tsx":
      importing("@/screens/transfer/components"),
    "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx":
      importing("@/screens/transfer/components"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("counts a route that re-exports a domain component as its user", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/account/components/CardBalance/CardBalance.tsx": COMPONENT,
    "src/app/index.tsx":
      'export { default } from "@/domains/account/components/CardBalance/CardBalance";\n',
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("passes a domain component that only the demo layer's own components use", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/domains/transfer/components/PillScenario/PillScenario.tsx": COMPONENT,
    "src/mocks/components/SheetSwitcher/SheetSwitcher.tsx": importing(
      "@/domains/transfer/components/PillScenario/PillScenario",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("ignores shared code, which holds no placement subjects", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ButtonPrimary/ButtonPrimary.tsx": COMPONENT,
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});
