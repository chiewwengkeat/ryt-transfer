const { filenameOf, parsePath, underSrcRoot } = require("./_paths");

/** Singular spellings, the plural derived: the ALLOWED spelling is the source of truth.
 * `hook` is absent on purpose — no filename uses it as a suffix. */
const ROLE_WORDS = [
  "action",
  "config",
  "conformance",
  "constant",
  "helper",
  "mock",
  "reducer",
  "route",
  "spec",
  "style",
  "test",
  "type",
  "util",
];

const SINGULAR_OF = new Map(ROLE_WORDS.map((word) => [word + "s", word]));

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A filename role suffix uses its singular spelling (Foo.type.ts, not Foo.types.ts). " +
        "FILENAMES ONLY — directory names stay plural (types/, hooks/, utils/), which is a " +
        "separate settled convention this rule must never reach. " +
        "Option `requireSrcRoot` (default true) limits the rule to files under a `src/` root.",
    },
    messages: {
      singular:
        "Filename '{{file}}' uses the plural role suffix '.{{plural}}.'. Use the singular '{{singular}}' — rename it to '{{fixed}}'. A second spelling for one role hides files from anyone searching for the first. FILENAMES ONLY: directory names stay plural (types/, hooks/, utils/), a separate settled convention this rule does not touch.",
    },
    schema: [
      {
        type: "object",
        properties: { requireSrcRoot: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const file = filenameOf(context);
    const opts = context.options[0] || {};
    const requireSrcRoot = opts.requireSrcRoot !== false;
    if (requireSrcRoot && !underSrcRoot(file)) return {};

    const p = parsePath(file);
    // ESLint hands a rule "<input>" for a bare --stdin with no --stdin-filename.
    if (!p.dir) return {};

    const plural = p.suffixes.find((s) => SINGULAR_OF.has(s));
    if (!plural) return {};

    const fixed = [
      p.stem,
      ...p.suffixes.map((s) => SINGULAR_OF.get(s) || s),
      p.ext,
    ]
      .filter((s) => s !== "")
      .join(".");
    return {
      Program(node) {
        context.report({
          node,
          messageId: "singular",
          data: {
            file: p.base,
            plural,
            singular: SINGULAR_OF.get(plural),
            fixed,
          },
        });
      },
    };
  },
};
