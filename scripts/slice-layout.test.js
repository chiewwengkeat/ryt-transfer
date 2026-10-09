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
