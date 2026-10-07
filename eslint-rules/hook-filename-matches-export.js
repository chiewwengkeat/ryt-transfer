const {
  camelCase,
  filenameOf,
  kebabCase,
  parsePath,
  stripAffixes,
} = require("./_paths");

const HOOK_EXPORT = /^use[A-Z]/;
const COMPONENT_EXPORT = /^[A-Z]/;
const SKIP_SUFFIXES = new Set(["test", "spec", "d"]);
const STORE_AFFIXES = { lead: ["use"], trail: ["Store"] };

/** A type export is not a name a file can be called after, so it must not count
 * toward "sole export" — counting it would silence every hook file that also
 * exports its own return type. `export *` makes the surface unknowable, which is
 * what `unknown` reports. */
function exportedNames(body) {
  const names = new Set();
  let unknown = false;
  for (const stmt of body) {
    if (stmt.type === "ExportAllDeclaration") {
      unknown = true;
      continue;
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      const d = stmt.declaration;
      if (!d) continue;
      if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration")
        names.add(d.id ? d.id.name : "");
      else names.add(d.type === "Identifier" ? d.name : "");
      continue;
    }
    if (stmt.type !== "ExportNamedDeclaration" || stmt.exportKind === "type")
      continue;
    const d = stmt.declaration;
    if (d) {
      if (
        d.type === "TSTypeAliasDeclaration" ||
        d.type === "TSInterfaceDeclaration"
      )
        continue;
      if (d.type === "VariableDeclaration")
        for (const v of d.declarations)
          names.add(v.id.type === "Identifier" ? v.id.name : "");
      else names.add(d.id ? d.id.name : "");
      continue;
    }
    for (const s of stmt.specifiers || []) {
      if (s.exportKind === "type") continue;
      names.add(s.exported.name === "default" ? s.local.name : s.exported.name);
    }
  }
  return { names, unknown };
}

/** Drops `use` and `Store`, so `store/transfer.ts` may export `useTransferStore`. Only
 * the first letter is case-folded, so `use-contentheight.ts` still reports. */
function core(name) {
  const stripped = stripAffixes(name, STORE_AFFIXES);
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

/** Compare kebab->camel, never camel->kebab: kebabCase() is lossy at digit boundaries
 * and would report correct files. The uppercase test is load-bearing: camelCase() leaves
 * `useContentHeight.tsx` untouched, so it would match its own export and pass. */
function nameMatches(stem, exportName) {
  if (/[A-Z]/.test(stem)) return false;
  const expected = camelCase(stem);
  return expected === exportName || core(expected) === core(exportName);
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A file whose sole export is a use* hook must be named after that hook " +
        "(use-content-height.ts exports useContentHeight). Distinct from " +
        "hook-file-kebab-case, which checks the casing of a file already named use*: " +
        "this one checks the name itself, and reaches files not named use* at all. " +
        "A leading `use` and a trailing `Store` may be dropped from the filename, so " +
        "store/transfer.ts exporting useTransferStore passes.",
    },
    messages: {
      rename:
        "File '{{file}}' exports nothing but the hook '{{hook}}', so its name should be '{{kebab}}'. A reader searching for '{{hook}}' has to land on the file that defines it, and an importer should be able to guess the path from the name. Dropping a leading 'use' or a trailing 'Store' is allowed (store/transfer.ts exporting useTransferStore passes); anything else must match.",
    },
    schema: [],
  },
  create(context) {
    const p = parsePath(filenameOf(context));
    // ESLint hands a rule "<input>" for a bare --stdin with no --stdin-filename;
    // the stem would then be compared against nothing.
    if (!p.dir) return {};
    if (p.stem === "index") return {};
    if (p.suffixes.some((s) => SKIP_SUFFIXES.has(s))) return {};

    return {
      Program(node) {
        const { names, unknown } = exportedNames(node.body);
        if (unknown) return;
        // A file exporting a component and a hook keeps its component filename; dead
        // under the sole-export trigger, kept so widening that trigger cannot reverse it.
        for (const name of names) if (COMPONENT_EXPORT.test(name)) return;
        if (names.size !== 1) return;
        const [hook] = names;
        if (!HOOK_EXPORT.test(hook)) return;
        if (nameMatches(p.stem, hook)) return;
        context.report({
          node,
          messageId: "rename",
          data: {
            file: p.base,
            hook,
            // Only the stem is checked, so the suggestion keeps any role suffix
            // rather than proposing a name the rule would not itself require.
            kebab: [kebabCase(hook), ...p.suffixes, p.ext]
              .filter((s) => s !== "")
              .join("."),
          },
        });
      },
    };
  },
};
