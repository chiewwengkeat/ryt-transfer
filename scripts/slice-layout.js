const fs = require("node:fs");
const path = require("node:path");

const SCREENS_FOLDER_ENTRIES = ["components", "hooks", "lib", "i18n"];
const TRANSFER_FOLDER_ENTRIES = ["flow-store", "scenarios"];
const DOMAIN_ENTRIES = ["api", "components", "hooks", "lib", "i18n"];
const SCREEN_FOLDER = /^[A-Z][A-Za-z0-9]*Screen$/;
const ROOT_MODULE_FOLDER = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function listFiles(rootDir, relativeDir, found) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return found;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) listFiles(rootDir, relativePath, found);
    else found.push(relativePath);
  }
  return found;
}

function findEntriesOutsideTheSliceFolders(rootDir) {
  const failures = new Set();
  for (const file of listFiles(rootDir, "src", [])) {
    const [, kind, slice, entry, ...rest] = file.split("/");
    if (kind === "root") {
      // A slice's own folders at src/root's top level would sit beside the root view, not in it.
      const allowed =
        entry !== undefined &&
        (slice === "ViewRoot" ||
          (ROOT_MODULE_FOLDER.test(slice) &&
            !["components", "hooks", "lib", "i18n"].includes(slice)));
      if (!allowed)
        failures.add(
          `src/root/${slice}: src/root holds only ViewRoot/ and kebab-case module folders`,
        );
      continue;
    }
    if (entry === undefined) continue;
    const isFolder = rest.length > 0;
    if (kind === "screens") {
      const allowed =
        isFolder &&
        (SCREEN_FOLDER.test(entry) ||
          SCREENS_FOLDER_ENTRIES.includes(entry) ||
          (slice === "transfer" && TRANSFER_FOLDER_ENTRIES.includes(entry)));
      if (!allowed)
        failures.add(
          `src/screens/${slice}/${entry}: a screens folder holds only <Name>Screen/, ${listFolders(SCREENS_FOLDER_ENTRIES)}, and the transfer folder its ${listFolders(TRANSFER_FOLDER_ENTRIES)}`,
        );
    } else if (
      kind === "domains" &&
      !(isFolder && DOMAIN_ENTRIES.includes(entry))
    ) {
      failures.add(
        `src/domains/${slice}/${entry}: a domain holds only ${listFolders(DOMAIN_ENTRIES)}`,
      );
    }
  }
  return [...failures];
}

function listFolders(names) {
  const folders = names.map((name) => `${name}/`);
  return `${folders.slice(0, -1).join(", ")} and ${folders.at(-1)}`;
}

module.exports = { findEntriesOutsideTheSliceFolders };
