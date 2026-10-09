const { readdirSync } = require("fs");

const MODULE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

function filenameOf(context) {
  return toForwardSlashes(context.filename);
}

/** `stem` stops at the FIRST dot so that two rules can read one filename without
 * overlapping: `foo.helper.test.ts` is stem `foo`, suffixes `["helper","test"]`. */
function parsePath(filename) {
  const path = toForwardSlashes(filename);
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash);
  const base = path.slice(slash + 1);
  const lead = base.startsWith(".") ? "." : "";
  const parts = base.slice(lead.length).split(".");
  return {
    path,
    dir,
    base,
    stem: lead + parts[0],
    suffixes: parts.slice(1, Math.max(1, parts.length - 1)),
    ext: parts.length > 1 ? parts[parts.length - 1] : "",
    parent: dir.slice(dir.lastIndexOf("/") + 1),
    dirSegments: dir ? dir.split("/").filter(Boolean) : [],
  };
}

/** Compare names in THIS direction: kebabCase() below is lossy, so only this one proves a misnaming. */
function camelCase(name) {
  return name
    .split("-")
    .filter(Boolean)
    .map((seg, i) =>
      i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1),
    )
    .join("");
}

/** The transform hook-file-kebab-case.js already applies, so two rules never
 * suggest different spellings. Lossy where a word starts with a digit
 * (`useLast7Days` -> `use-last7-days`, where the file would be
 * `use-last-7-days`), so use it to suggest a rename, never to decide one
 * is wrong. */
function kebabCase(name) {
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/^-/, "");
}

/** `("useTransferStore", { lead: ["use"], trail: ["Store"] })` is `"Transfer"`.
 * Longest affix wins; one that would empty the name is left on. */
function stripAffixes(name, affixes = {}) {
  const longestFirst = (list) =>
    [...(list || [])].sort((a, b) => b.length - a.length);
  let out = name;
  for (const p of longestFirst(affixes.lead)) {
    if (out.length > p.length && out.startsWith(p)) {
      out = out.slice(p.length);
      break;
    }
  }
  for (const s of longestFirst(affixes.trail)) {
    if (out.length > s.length && out.endsWith(s)) {
      out = out.slice(0, -s.length);
      break;
    }
  }
  return out;
}

/** ⚠ The only disk read here, and it returns [] for a path that does not exist —
 * so a rule built on it is INERT against a synthetic RuleTester filename, where
 * every case passes as `valid` and no `invalid` case can report. Such a rule
 * needs its cases on a real tree (`mkdtempSync`). */
function dirEntries(dir) {
  try {
    return readdirSync(toForwardSlashes(dir));
  } catch {
    return [];
  }
}

function isRelativeSource(source) {
  return /^\.\.?(\/|$)/.test(String(source));
}

/** Resolves `.` and `..`. No disk. */
function joinPath(dir, rel) {
  const out = dir ? toForwardSlashes(dir).split("/") : [];
  for (const seg of toForwardSlashes(rel).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** The file a relative import resolves to, or null. Reads the disk. */
function resolveModule(fromFile, source, exts = MODULE_EXTS) {
  if (!isRelativeSource(source)) return null;
  const target = joinPath(parsePath(fromFile).dir, source);
  const slash = target.lastIndexOf("/");
  const here = dirEntries(target.slice(0, slash));
  const base = target.slice(slash + 1);
  for (const ext of exts) if (here.includes(base + ext)) return target + ext;
  if (here.includes(base)) {
    const inside = dirEntries(target);
    for (const ext of exts)
      if (inside.includes("index" + ext)) return target + "/index" + ext;
  }
  return null;
}

module.exports = {
  MODULE_EXTS,
  camelCase,
  dirEntries,
  filenameOf,
  isRelativeSource,
  joinPath,
  kebabCase,
  parsePath,
  resolveModule,
  stripAffixes,
};

function toForwardSlashes(filename) {
  return String(filename).replace(/\\/g, "/");
}
