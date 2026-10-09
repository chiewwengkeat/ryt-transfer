const path = require("path");

const {
  MODULE_EXTS,
  dirEntries,
  filenameOf,
  isRelativeSource,
  joinPath,
  parsePath,
  resolveModule,
} = require("./_paths");
const { moduleSources } = require("./_imports");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A component folder's internal files may be imported only from within that " +
        "folder. A component folder is a directory holding a same-named `.tsx`; its " +
        "public entry is that file, plus `index.{ts,tsx,js,jsx}` where one exists, and " +
        "everything else colocated in it is internal. A nested component folder has its " +
        "own public entry, so reaching it is allowed — reaching past it is not, including " +
        'from the parent folder. Re-exports count: `export { X } from "../Bar/internal"` ' +
        "reaches in exactly as an import does. Relative sources are resolved, and so is " +
        'an alias the `aliases` option maps to a directory (`{ "@/": "/abs/src" }`), ' +
        "mirroring the tsconfig paths, since an alias import reaches the same files.",
    },
    messages: {
      crossInternals:
        "'{{target}}' is internal to the component folder '{{owner}}/' — only files inside {{owner}}/ may import it. Import {{owner}} itself if its rendered output is what you need; if you genuinely need '{{target}}', then it is not {{owner}}'s alone, so lift it to a shared location both can import. A colocated sibling is part of its component's implementation and gets renamed with it.",
    },
    schema: [
      {
        type: "object",
        properties: {
          aliases: { type: "object", additionalProperties: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const file = filenameOf(context);
    const dir = parsePath(file).dir;
    if (!dir) return {};
    const aliases = Object.entries((context.options[0] || {}).aliases || {});
    const asRelativeSource = (source) => {
      if (isRelativeSource(source)) return source;
      const alias = aliases.find(([prefix]) => source.startsWith(prefix));
      if (!alias) return null;
      const target = joinPath(alias[1], source.slice(alias[0].length));
      const relative = path.posix.relative(dir, target);
      return relative.startsWith(".") ? relative : "./" + relative;
    };

    return {
      Program(node) {
        for (const mod of moduleSources(node)) {
          const source = asRelativeSource(mod.source);
          if (source === null) continue;
          const hit = findCrossedInternal(file, source);
          if (!hit) continue;
          context.report({
            node: mod.node,
            messageId: "crossInternals",
            data: hit,
          });
        }
      },
    };
  },
};

function commonAncestor(a, b) {
  const x = a.split("/");
  const y = b.split("/");
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return x.slice(0, i).join("/");
}

function lastSegment(dir) {
  return dir.slice(dir.lastIndexOf("/") + 1);
}

function isComponentDir(dir) {
  return dirEntries(dir).includes(lastSegment(dir) + ".tsx");
}

/** Stops at the common ancestor: a folder holding both files is never crossed into. */
function owningComponentDir(fromFile, target) {
  const stop = commonAncestor(parsePath(fromFile).dir, parsePath(target).dir);
  let dir = parsePath(target).dir;
  while (dir.length > stop.length) {
    if (isComponentDir(dir)) return dir;
    const cut = dir.lastIndexOf("/");
    if (cut < 0) break;
    dir = dir.slice(0, cut);
  }
  return null;
}

function isEntryPoint(dir, target) {
  const p = parsePath(target);
  if (p.dir !== dir) return false;
  return (
    p.base === lastSegment(dir) + ".tsx" ||
    MODULE_EXTS.some((e) => p.base === "index" + e)
  );
}

/** The same question answered from the import path alone, for when the disk
 * cannot answer it. Coarser: it cannot tell a component folder from any folder,
 * so `../utils/format` reads as a crossing here and does not on disk. */
function crossesTextually(dir, source) {
  const p = parsePath(joinPath(dir, source));
  if (p.dir.length <= commonAncestor(dir, p.dir).length) return null;
  const owner = lastSegment(p.dir);
  if (p.base === owner || p.base === "index") return null;
  return { target: p.base, owner };
}

function findCrossedInternal(file, source) {
  const target = resolveModule(file, source);
  if (target) {
    const owner = owningComponentDir(file, target);
    if (!owner || isEntryPoint(owner, target)) return null;
    return { target: parsePath(target).base, owner: lastSegment(owner) };
  }
  // Nothing resolved. An unreadable folder (an unsaved buffer, a --stdin run) gets
  // judged from the import path; a folder that reads back but lacks the file holds
  // a broken import, not a crossing.
  const dir = parsePath(file).dir;
  if (dirEntries(parsePath(joinPath(dir, source)).dir).length > 0) return null;
  return crossesTextually(dir, source);
}
