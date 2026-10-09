const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

for (const [slice, users, home] of [
  [
    "one screens folder",
    [
      "src/screens/transfer/components/SectionTransferDetails/SectionTransferDetails.tsx",
      "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
    ],
    "src/screens/transfer/components/",
  ],
  [
    "one domain",
    [
      "src/domains/account/components/CardBalance/CardBalance.tsx",
      "src/domains/account/components/CardLimit/CardLimit.tsx",
    ],
    "src/domains/account/components/",
  ],
  [
    "the root",
    ["src/root/ViewRoot/ViewRoot.tsx"],
    "src/root/ViewRoot/components/",
  ],
  [
    "one other base component",
    ["src/shared/ui/BottomSheetFrame/BottomSheetFrame.tsx"],
    "src/shared/ui/BottomSheetFrame/components/",
  ],
])
  test(`fails a base component whose users all sit in ${slice}, naming where it belongs until a second slice uses it`, () => {
    const { exitCode, errors } = runPlacementCheckOn(rowDetailUsedBy(users));
    assert.equal(exitCode, 1);
    assert.match(
      errors,
      new RegExp(
        `^src/shared/ui/RowDetail: every user sits in .* - it belongs in ${home} until a second slice uses it$`,
        "m",
      ),
    );
  });

test("fails a base component only the demo layer uses, naming src/mocks/", () => {
  const { exitCode, errors } = runPlacementCheckOn(
    rowDetailUsedBy(["src/mocks/switcher/components/ViewDemo/ViewDemo.tsx"]),
  );
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /^src\/shared\/ui\/RowDetail: only the demo layer uses it .* - it belongs in src\/mocks\/$/m,
  );
});

for (const [slices, users] of [
  [
    "two slices",
    [
      "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
      "src/screens/home/HomeScreen/HomeScreen.tsx",
    ],
  ],
  [
    "a screens folder and another base component, which counts as a slice of its own",
    [
      "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx",
      "src/shared/ui/BottomSheetFrame/BottomSheetFrame.tsx",
    ],
  ],
  [
    "two other base components",
    [
      "src/shared/ui/BottomSheetFrame/BottomSheetFrame.tsx",
      "src/shared/ui/CardPressable/CardPressable.tsx",
    ],
  ],
])
  test(`passes a base component that ${slices} use`, () => {
    const { exitCode, errors } = runPlacementCheckOn(rowDetailUsedBy(users));
    assert.equal(errors, "");
    assert.equal(exitCode, 0);
  });

test("passes a base component only routes render, since a route may render one alone", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/shared/ui/ViewScreenError/ViewScreenError.tsx":
      PLACEHOLDER_COMPONENT_SOURCE,
    "src/app/transfer/review.tsx":
      'export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";\n',
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const CHECK_SCRIPT = path.join(__dirname, "check-placement-ladder.js");
const PLACEHOLDER_COMPONENT_SOURCE =
  "export default function Placeholder() {\n  return null;\n}\n";

function rowDetailUsedBy(users) {
  const userSource =
    'import RowDetail from "@/shared/ui/RowDetail/RowDetail";\n\nexport default function Placeholder() {\n  return RowDetail;\n}\n';
  return {
    "src/shared/ui/RowDetail/RowDetail.tsx": PLACEHOLDER_COMPONENT_SOURCE,
    ...Object.fromEntries(users.map((user) => [user, userSource])),
  };
}

function runPlacementCheckOn(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "placement-ladder-"));
  try {
    for (const [file, content] of Object.entries(tree)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
    const result = spawnSync(process.execPath, [CHECK_SCRIPT, root], {
      encoding: "utf8",
    });
    return { exitCode: result.status, errors: result.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
