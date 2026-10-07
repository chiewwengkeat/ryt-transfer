const SRC = /(?:^|\/)src\//;
const CAMEL_HOOK = /^use[A-Z]/;

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Hook filenames use kebab-case (use-foo.ts). " +
        "Option `requireSrcRoot` (default true) limits the rule to files under a `src/` root.",
    },
    messages: {
      kebab:
        "Hook file '{{file}}' is camelCase. Rename it to '{{kebab}}' — the exported function stays camelCase, only the filename is kebab-cased. Uniform hook filenames keep imports predictable across the repo.",
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
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    );
    const opts = context.options[0] || {};
    const requireSrcRoot = opts.requireSrcRoot !== false;
    if (requireSrcRoot && !SRC.test(filename)) return {};

    const slash = filename.lastIndexOf("/");
    const dir = filename.slice(0, slash);
    // Singular stays unendorsed; it is matched so a `hook/` directory is policed
    // rather than exempt. Any ancestor segment counts, unlike component-own-folder's
    // immediate-parent anchor — a hook keeps its conventions inside its own folder.
    if (!dir.split("/").some((seg) => seg === "hooks" || seg === "hook"))
      return {};

    const base = filename.slice(slash + 1);
    if (!CAMEL_HOOK.test(base)) return {};

    const kebab = base.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    return {
      Program(node) {
        context.report({
          node,
          messageId: "kebab",
          data: { file: base, kebab },
        });
      },
    };
  },
};
