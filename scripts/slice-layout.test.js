const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

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
  [
    "a flow-store folder outside the transfer screens folder",
    "src/screens/home/flow-store/flow-store.ts",
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

for (const [entry, file] of [
  ["a file directly inside src/root", "src/root/app-launch.ts"],
  [
    "a folder in src/root that is neither ViewRoot nor a kebab-case module folder",
    "src/root/ViewAppError/ViewAppError.tsx",
  ],
  [
    "a slice's own folder at src/root's top level",
    "src/root/components/BannerOffline/BannerOffline.tsx",
  ],
]) {
  test(`fails ${entry}`, () => {
    const { exitCode, errors } = runPlacementCheckOn({
      [file]: PLACEHOLDER_COMPONENT_SOURCE,
    });
    assert.equal(exitCode, 1);
    assert.match(errors, /^src\/root\/[^:]+: src\/root holds only /m);
  });
}

test("passes lib/ in a screens folder and a domain, the transfer folder's flow-store/, and src/root's ViewRoot/ and module folders", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    "src/screens/transfer/flow-store/flow-store.ts":
      "export const flowStore = {};\n",
    "src/screens/transfer/lib/refresh-after-approval/refresh-after-approval.ts":
      'import { flowStore } from "@/screens/transfer/flow-store/flow-store";\n\nexport const refresh = flowStore;\n',
    "src/screens/transfer/TransferResultScreen/TransferResultScreen.tsx":
      'import { refresh } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";\nimport { scenarioIds } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";\n\nexport default function TransferResultScreen() {\n  return [refresh, scenarioIds];\n}\n',
    "src/screens/transfer/TransferReviewScreen/TransferReviewScreen.tsx":
      'import { refresh } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";\n\nexport default function TransferReviewScreen() {\n  return refresh;\n}\n',
    "src/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id.ts":
      "export const scenarioIds = {};\n",
    "src/screens/home/HomeScreen/HomeScreen.tsx":
      'import { scenarioIds } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";\n\nexport default function HomeScreen() {\n  return scenarioIds;\n}\n',
    "src/root/ViewRoot/ViewRoot.tsx": PLACEHOLDER_COMPONENT_SOURCE,
    "src/root/app-launch/app-launch.ts": "export const demoLayer = null;\n",
    "src/root/deep-links/deep-links.ts":
      "export const redirectSystemPath = null;\n",
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});
