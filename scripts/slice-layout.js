const fs = require("node:fs");
const path = require("node:path");

const SCREENS_FOLDER_ENTRIES = ["components", "hooks", "state", "i18n"];
const DOMAIN_ENTRIES = ["api", "components", "hooks", "i18n"];
const SCREEN_FOLDER = /^[A-Z][A-Za-z0-9]*Screen$/;

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
    if (entry === undefined) continue;
    const isFolder = rest.length > 0;
    if (kind === "screens") {
      const allowed =
        isFolder &&
        (SCREEN_FOLDER.test(entry) ||
          SCREENS_FOLDER_ENTRIES.includes(entry) ||
          (slice === "transfer" && entry === "scenarios"));
      if (!allowed)
        failures.add(
          `src/screens/${slice}/${entry}: a screens folder holds only <Name>Screen/, components/, hooks/, state/ and i18n/, and the transfer folder its scenarios/`,
        );
    } else if (
      kind === "domains" &&
      !(isFolder && DOMAIN_ENTRIES.includes(entry))
    ) {
      failures.add(
        `src/domains/${slice}/${entry}: a domain holds only api/, components/, hooks/ and i18n/`,
      );
    }
  }
  return [...failures];
}

module.exports = { findEntriesOutsideTheSliceFolders };
