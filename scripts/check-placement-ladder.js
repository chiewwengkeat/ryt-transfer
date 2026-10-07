const path = require("node:path");

const { readImportGraph } = require("./import-graph");

const TEST_FILE = /(\.(test|spec)\.[jt]sx?$)|(\/__tests__\/)/;

function findPlacedComponentOrHook(file) {
  const parts = file.split("/");
  if (parts[1] !== "screens" && parts[1] !== "domains") return null;
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
    const isSliceFolder =
      length === 3 && ["screens", "domains"].includes(candidate[1]);
    if (isScreenFolder || isComponentFolder || isSliceFolder)
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
  // A route counts as a user through a re-export: the router imports it, not app code.
  const reachableThrough = new Set(placed.files);
  for (let grew = true; grew;) {
    grew = false;
    for (const [file, edges] of edgesByModule) {
      if (reachableThrough.has(file) || file.startsWith("src/app/")) continue;
      if (edges.reexports.some((target) => reachableThrough.has(target))) {
        reachableThrough.add(file);
        grew = true;
      }
    }
  }

  const users = [];
  for (const [file, edges] of edgesByModule) {
    const insidePlaced = placed.isFile
      ? file === placed.path
      : file.startsWith(`${placed.path}/`);
    const viaRoute =
      file.startsWith("src/app/") &&
      edges.reexports.some((target) => reachableThrough.has(target));
    if (
      !insidePlaced &&
      (viaRoute || edges.uses.some((target) => reachableThrough.has(target)))
    )
      users.push(file);
  }
  return users;
}

function checkPlacementLadder(rootDir) {
  const edgesByModule = new Map(
    [...readImportGraph(rootDir)].filter(
      ([file]) => !TEST_FILE.test(file) && !file.startsWith("src/test/"),
    ),
  );

  const placedByPath = new Map();
  for (const file of edgesByModule.keys()) {
    const placed = findPlacedComponentOrHook(file);
    if (!placed) continue;
    if (!placedByPath.has(placed.path))
      placedByPath.set(placed.path, { ...placed, files: [] });
    placedByPath.get(placed.path).files.push(file);
  }

  const failures = [];
  for (const placed of placedByPath.values()) {
    const users = findAppUsersOf(placed, edgesByModule);
    if (users.length === 0) {
      failures.push(
        `${placed.path}: no app code uses it, and tests do not count - add it in the commit that adds its first user`,
      );
      continue;
    }

    const usedOutsideSlices = users.some(
      (file) => !/^src\/(screens|domains)\//.test(file),
    );
    const owner = usedOutsideSlices
      ? null
      : findNearestFolderThatHoldsComponents(findCommonDirectory(users));
    const shownUsers =
      users.slice(0, 3).join(", ") + (users.length > 3 ? ", ..." : "");
    if (owner === null) {
      if (
        !new RegExp(`^src/domains/[^/]+/${placed.kind}$`).test(placed.container)
      ) {
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

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const { placedCount, failures } = checkPlacementLadder(rootDir);
for (const failure of failures) console.error(failure);
console.log(
  `placement ladder: ${placedCount} components and hooks checked, ${failures.length} misplaced`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
