const { filenameOf } = require("./_paths");

const CAMEL_HOOK = /^use[A-Z]/;

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Hook filenames use kebab-case (use-foo.ts).",
    },
    messages: {
      kebab:
        "Hook file '{{file}}' is camelCase. Rename it to '{{kebab}}' — the exported function stays camelCase, only the filename is kebab-cased. Uniform hook filenames keep imports predictable across the repo.",
    },
    schema: [],
  },
  create(context) {
    const filename = filenameOf(context);
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
