const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { isTestCode } = require("../.config/test-files");
const { readImportGraph } = require("./import-graph");
const { findEntriesOutsideTheSliceFolders } = require("./slice-layout");

function findPlacedComponentOrHook(file) {
  const parts = file.split("/");
  if (!["screens", "domains", "shared"].includes(parts[1])) return null;
  for (let i = parts.length - 2; i >= 2; i -= 1) {
    if (parts[i] === "components" || parts[i] === "hooks") {
      return {
        path: parts.slice(0, i + 2).join("/"),
        container: parts.slice(0, i + 1).join("/"),
        kind: parts[i],
        isFile: i + 2 === parts.length,
      };
    }
  }
  return null;
}

function findNearestFolderThatHoldsComponents(directory) {
  const parts = directory.split("/");
  for (let length = parts.length; length >= 3; length -= 1) {
    const candidate = parts.slice(0, length);
    const isScreenFolder =
      length === 4 &&
      candidate[1] === "screens" &&
      candidate[3].endsWith("Screen");
    const isComponentFolder = candidate[length - 2] === "components";
    const isBaseComponentFolder =
      length === 4 &&
      candidate[1] === "shared" &&
      candidate[2] === "ui" &&
      /^[A-Z]/.test(candidate[3]);
    const isSliceFolder =
      length === 3 && ["screens", "domains", "shared"].includes(candidate[1]);
    if (
      isScreenFolder ||
      isComponentFolder ||
      isBaseComponentFolder ||
      isSliceFolder
    )
      return candidate.join("/");
  }
  return null;
}

function findCommonDirectory(files) {
  const directoryParts = files.map((file) =>
    path.posix.dirname(file).split("/"),
  );
  const common = [];
  for (
    let i = 0;
    directoryParts.every(
      (parts) => i < parts.length && parts[i] === directoryParts[0][i],
    );
    i += 1
  )
    common.push(directoryParts[0][i]);
  return common.join("/");
}

function findAppUsersOf(placed, edgesByModule) {
  const reachableThrough = new Set(placed.files);
  for (let grew = true; grew;) {
    grew = false;
    for (const [file, edges] of edgesByModule) {
      if (reachableThrough.has(file)) continue;
      if (edges.reexports.some((target) => reachableThrough.has(target))) {
        reachableThrough.add(file);
        grew = true;
      }
    }
  }

  const users = [];
  let usedByRoute = false;
  for (const [file, edges] of edgesByModule) {
    const insidePlaced = placed.isFile
      ? file === placed.path
      : file.startsWith(`${placed.path}/`);
    const reaches = (targets) =>
      targets.some((target) => reachableThrough.has(target));
    if (insidePlaced) continue;
    // A route only re-exports a screen, so a route never makes a component's placement right.
    if (file.startsWith("src/app/"))
      usedByRoute ||= reaches(edges.uses) || reaches(edges.reexports);
    else if (reaches(edges.uses)) users.push(file);
  }
  return { users, usedByRoute };
}

function checkPlacementLadder(rootDir) {
  const edgesByModule = new Map(
    [...readImportGraph(rootDir)].filter(([file]) => !isTestCode(file)),
  );

  const placedByPath = new Map();
  for (const file of edgesByModule.keys()) {
    const placed = findPlacedComponentOrHook(file);
    if (!placed) continue;
    if (!placedByPath.has(placed.path))
      placedByPath.set(placed.path, { ...placed, files: [] });
    placedByPath.get(placed.path).files.push(file);
  }

  const failures = findEntriesOutsideTheSliceFolders(rootDir);
  for (const placed of placedByPath.values()) {
    const { users, usedByRoute } = findAppUsersOf(placed, edgesByModule);
    if (users.length === 0) {
      failures.push(
        usedByRoute
          ? `${placed.path}: only a route uses it, and a route only re-exports a screen - move it into the screen that renders it`
          : `${placed.path}: no app code uses it, and tests do not count - add it in the commit that adds its first user`,
      );
      continue;
    }

    const shownUsers =
      users.slice(0, 3).join(", ") + (users.length > 3 ? ", ..." : "");
    if (users.every((file) => file.startsWith("src/mocks/"))) {
      failures.push(
        `${placed.path}: only the demo layer uses it (${shownUsers}) - it belongs in src/mocks/`,
      );
      continue;
    }
    if (
      placed.kind === "hooks" &&
      placed.container.startsWith("src/shared/") &&
      users.every((file) => file.startsWith("src/shell/"))
    ) {
      failures.push(
        `${placed.path}: only the shell uses it (${shownUsers}) - it belongs in src/shell/`,
      );
      continue;
    }

    const usedOutsideSlices = users.some(
      (file) => !/^src\/(screens|domains|shared)\//.test(file),
    );
    const owner = usedOutsideSlices
      ? null
      : findNearestFolderThatHoldsComponents(findCommonDirectory(users));
    if (owner === null) {
      const atWideLevel =
        placed.container.startsWith("src/shared/") ||
        new RegExp(`^src/domains/[^/]+/${placed.kind}$`).test(placed.container);
      if (!atWideLevel) {
        failures.push(
          `${placed.path}: used across screens folders or outside them (${shownUsers}) - it belongs in src/domains/<area>/${placed.kind}/`,
        );
      }
    } else if (placed.container !== `${owner}/${placed.kind}`) {
      failures.push(
        `${placed.path}: every user sits in ${owner}/ (${shownUsers}) - it belongs in ${owner}/${placed.kind}/`,
      );
    }
  }
  return { placedCount: placedByPath.size, failures: failures.sort() };
}

// The commit's own tree: the working tree may hold users, or strays, the commit does not.
function checkoutStagedSnapshot() {
  const snapshotDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "placement-staged-"),
  );
  const runGit = (args, input) => {
    const result = spawnSync("git", args, { input, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    return result.stdout;
  };
  const stagedPaths = runGit(["ls-files", "-z", "--", "src", "modules"]);
  runGit(
    ["checkout-index", "-z", "--stdin", `--prefix=${snapshotDir}/`],
    stagedPaths,
  );
  return snapshotDir;
}

const staged = process.argv[2] === "--staged";
const rootDir = staged
  ? checkoutStagedSnapshot()
  : path.resolve(process.argv[2] ?? process.cwd());
try {
  const { placedCount, failures } = checkPlacementLadder(rootDir);
  for (const failure of failures) console.error(failure);
  console.log(
    `placement ladder: ${placedCount} components and hooks checked, ${failures.length} misplaced`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
} finally {
  if (staged) fs.rmSync(rootDir, { recursive: true, force: true });
}
