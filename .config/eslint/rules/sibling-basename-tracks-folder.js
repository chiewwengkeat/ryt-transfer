const { dirEntries, filenameOf, parsePath } = require("./_paths");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a colocated sibling (foo.type.ts, foo.helper.ts, foo.style.ts) to be named " +
        "for the unit it belongs to: either its own folder, or a module sitting beside it. " +
        "Runs only in a folder that has an identity to track — one holding a component, or one " +
        "named after a module inside it — so shared type, mock and helper directories, where " +
        "each file names its own domain, are outside the rule rather than exempted by a list. " +
        "Test files are excluded: a route test is named for the route it exercises.",
    },
    messages: {
      orphanSibling:
        "'{{file}}' is colocated but names '{{stem}}', which nothing in this folder is called. A colocated file takes the name of the unit it belongs to — the folder '{{parent}}', or a module beside it — so every file here says what it is part of. Rename it to {{suggestions}}.",
      orphanSiblingNoName:
        "'{{file}}' is colocated but names '{{stem}}', which nothing in this folder is called — and every name it could take ({{taken}}) is in use. Give '{{stem}}' its own module here, or move this file beside the unit it describes.",
    },
    schema: [],
  },
  create(context) {
    const p = parsePath(filenameOf(context));
    if (!p.dir) return {};
    if (p.suffixes.length === 0) return {};
    if (p.base.endsWith(".d.ts")) return {};
    // A test is named for what it exercises, which need not sit beside it.
    if (p.suffixes.includes("test") || p.suffixes.includes("spec")) return {};
    if (!p.suffixes.some((s) => ROLE_SUFFIXES.includes(s))) return {};

    const tail = "." + [...p.suffixes, p.ext].join(".");
    const entries = dirEntries(p.dir).filter((n) => n !== p.base);

    const reportOrphanSibling = (node, candidates) => {
      const names = candidates.map((c) => c + tail);
      const free = names.filter((n) => !entries.includes(n));
      if (free.length > 0) {
        context.report({
          node,
          messageId: "orphanSibling",
          data: {
            file: p.base,
            stem: p.stem,
            parent: p.parent,
            suggestions: suggestionList(free),
          },
        });
        return;
      }
      context.report({
        node,
        messageId: "orphanSiblingNoName",
        data: { file: p.base, stem: p.stem, taken: takenList(names) },
      });
    };

    // Nothing else in the directory means no evidence either way — a lone
    // `types/order.type.ts` is correct, and so is an unsaved buffer whose
    // directory cannot be read. Reporting here would make the verdict flip when
    // an unrelated second file is added.
    if (entries.length === 0) return {};

    const components = componentStemsIn(entries);
    const modules = moduleStems(entries);
    if (components.length === 0 && !modules.includes(p.parent)) return {};
    if (p.stem === p.parent) return {};
    if (components.includes(p.stem) || modules.includes(p.stem)) return {};

    const candidates = uniqueValues([p.parent, ...components, ...modules]);
    return {
      Program(node) {
        reportOrphanSibling(node, candidates);
      },
    };
  },
};

// Not "any dot segment": platform segments (`.ios`, `.android`) name no owner.
const ROLE_SUFFIXES = [
  "constant",
  "helper",
  "mock",
  "reduce",
  "style",
  "type",
  "util",
];

// The caller drops the file under lint first: `Grid.type.tsx` would otherwise own itself.
function componentStemsIn(entries) {
  return entries
    .filter(
      (n) =>
        n.endsWith(".tsx") && !n.includes(".test.") && !n.includes(".spec."),
    )
    .map((n) => parsePath(n).stem);
}

function moduleStems(entries) {
  return entries
    .filter((n) => /\.tsx?$/.test(n) && !n.endsWith(".d.ts"))
    .map(parsePath)
    .filter((p) => p.suffixes.length === 0)
    .map((p) => p.stem);
}

function uniqueValues(list) {
  return [...new Set(list)];
}

function quoteList(names) {
  return names.map((n) => `'${n}'`).join(" or ");
}

// Bounded to two (the folder, then the nearest module) so a crowded folder cannot
// flood one lint message with filenames.
function suggestionList(names) {
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return (
    quoteList(shown) +
    (rest > 0 ? `, or one of ${rest} other modules here` : "")
  );
}

function takenList(names) {
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return quoteList(shown) + (rest > 0 ? ` and ${rest} more` : "");
}
