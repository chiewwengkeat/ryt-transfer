const { filenameOf } = require("./_paths");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require each component to live in its own folder, not loose under components/ " +
        "(a singular component/ directory is policed the same way).",
    },
    messages: {
      ownFolder:
        "Component '{{file}}' sits directly under {{dir}}/. Give it its own folder: {{dir}}/{{name}}/{{file}} — that folder is where any helper it already has colocates as a sibling (and a helper with its own helpers gets its own subfolder, recursively). ⛔ This says where a helper goes, never that one should exist: a child readers rarely need inlines into its user's body up to about 15 lines, one they usually need up to about 40 while the user stays within 200, and only a larger one, or one with state or effects that renders conditionally or in a list, takes a folder of its own.",
    },
    schema: [],
  },
  create(context) {
    const filename = filenameOf(context);
    const slash = filename.lastIndexOf("/");
    const base = filename.slice(slash + 1);
    if (!base.endsWith(".tsx")) return {};
    if (base.includes(".test.") || base.includes(".spec.")) return {};

    // Anchored on the immediate parent: a file-matches-folder check would re-fire
    // on helpers colocated beside a hook or an orchestrator.
    const dir = filename.slice(0, slash);
    const parent = dir.slice(dir.lastIndexOf("/") + 1);
    // A singular `component/` is matched so it is policed, not exempt.
    if (parent !== "components" && parent !== "component") return {};

    const name = base.slice(0, -".tsx".length);
    return {
      Program(node) {
        context.report({
          node,
          messageId: "ownFolder",
          data: { file: base, name, dir: parent },
        });
      },
    };
  },
};
