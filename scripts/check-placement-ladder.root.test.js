const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

test("fails a component only the root view uses whose files import one domain, naming that domain's components folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    [ROOT_VIEW_FILE]: moduleImporting(
      "./components/BannerOffline/BannerOffline",
    ),
    "src/root/ViewRoot/components/BannerOffline/BannerOffline.tsx":
      moduleImporting(TRANSFER_KEYS),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /BannerOffline: only src\/root uses it .* - it belongs in src\/domains\/transfer\/components\/$/m,
  );
});

test("passes that component once it sits in that domain", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    [ROOT_VIEW_FILE]: moduleImporting(
      "@/domains/transfer/components/BannerOffline/BannerOffline",
    ),
    "src/domains/transfer/components/BannerOffline/BannerOffline.tsx":
      moduleImporting(TRANSFER_KEYS),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("keeps a component whose files import two domains nested in the root view, counting its nested child's imports", () => {
  const sessionEndedDir = "src/root/ViewRoot/components/ViewSessionEnded";
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    [ROOT_VIEW_FILE]: moduleImporting(
      "./components/ViewSessionEnded/ViewSessionEnded",
    ),
    [`${sessionEndedDir}/ViewSessionEnded.tsx`]: moduleImporting(
      TRANSFER_KEYS,
      "./components/TextLastTransferReference/TextLastTransferReference",
    ),
    [`${sessionEndedDir}/components/TextLastTransferReference/TextLastTransferReference.tsx`]:
      moduleImporting(ACCOUNT_KEYS),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a hook only the root view uses whose files import one domain, naming that domain's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    [ROOT_VIEW_FILE]: moduleImporting("./hooks/use-pending-launch"),
    "src/root/ViewRoot/hooks/use-pending-launch.ts":
      moduleImporting(ACCOUNT_KEYS),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /use-pending-launch\.ts: only src\/root uses it .* - it belongs in src\/domains\/account\/hooks\/$/m,
  );
});

test("passes a hook only the root view uses whose files import no domain, nested in the root view", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...rootModules,
    [ROOT_VIEW_FILE]: moduleImporting("./hooks/use-screen-capture-block"),
    "src/root/ViewRoot/hooks/use-screen-capture-block.ts": moduleImporting(
      "@/root/app-launch/app-launch",
    ),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("fails a lib module only the root view uses whose files import one domain, naming that domain's lib folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    [ROOT_VIEW_FILE]: moduleImporting("./lib/pending-records/pending-records"),
    "src/root/ViewRoot/lib/pending-records/pending-records.ts":
      moduleImporting(TRANSFER_KEYS),
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /pending-records: only src\/root uses it .* - it belongs in src\/domains\/transfer\/lib\/$/m,
  );
});

test("fails a domain hook only the root view uses whose files import no domain, naming the root view's hooks folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    [ROOT_VIEW_FILE]: moduleImporting(
      "@/domains/approval/hooks/use-sheet-host",
    ),
    "src/domains/approval/hooks/use-sheet-host.ts":
      "export function useSheetHost() {\n  return null;\n}\n",
  });
  assert.equal(exitCode, 1);
  assert.match(
    errors,
    /use-sheet-host\.ts: every user sits in src\/root\/ViewRoot\/ .* - it belongs in src\/root\/ViewRoot\/hooks\/$/m,
  );
});

test("keeps a piece that imports one domain and a screens folder nested in the root view, since no domain may read a screens folder", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    "src/screens/transfer/state/transfer-flow.ts":
      "export const transferFlow = {};\n",
    [ROOT_VIEW_FILE]: moduleImporting(
      "./components/BannerOffline/BannerOffline",
    ),
    "src/root/ViewRoot/components/BannerOffline/BannerOffline.tsx":
      moduleImporting(TRANSFER_KEYS, "@/screens/transfer/state/transfer-flow"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

test("never places the root's top level: its root view and module folders", () => {
  const { exitCode, errors } = runPlacementCheckOn({
    ...domainKeys,
    ...rootModules,
    "src/app/_layout.tsx":
      'export { default } from "@/root/ViewRoot/ViewRoot";\n',
    [ROOT_VIEW_FILE]: moduleImporting("@/root/app-launch/app-launch"),
  });
  assert.equal(errors, "");
  assert.equal(exitCode, 0);
});

const CHECK_SCRIPT = path.join(__dirname, "check-placement-ladder.js");
const ROOT_VIEW_FILE = "src/root/ViewRoot/ViewRoot.tsx";
const TRANSFER_KEYS = "@/domains/transfer/api/transfer.keys";
const ACCOUNT_KEYS = "@/domains/account/api/account.keys";
const domainKeys = {
  "src/domains/transfer/api/transfer.keys.ts": "export const keys = {};\n",
  "src/domains/account/api/account.keys.ts": "export const keys = {};\n",
};
const rootModules = {
  "src/root/app-launch/app-launch.ts": moduleImporting(ACCOUNT_KEYS),
};

function moduleImporting(...specifiers) {
  return specifiers
    .map((specifier, i) => `import * as Imported${i} from "${specifier}";\n`)
    .join("");
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
