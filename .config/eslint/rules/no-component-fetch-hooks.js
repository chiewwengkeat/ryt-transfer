const { filenameOf, parsePath } = require("./_paths");
const { fetchHookCall, importedBindings } = require("./_imports");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A component may not call useQuery, useMutation or useInfiniteQuery — owning a " +
        "fetch is the data layer's job. Reading the cache stays allowed: useQueryClient, " +
        "cache orchestration, and importing a query's options factory to reach its cache " +
        "key. Exempt: hook files (`use-*`) and tests.",
    },
    messages: {
      componentFetch:
        "Component '{{file}}' calls {{hook}}(). A component does not own a fetch — move it into its domain's endpoint module, `src/domains/<area>/api/<endpoint>/<endpoint>.ts`, which exports the hook and its query options, and call that hook here instead. Reading the cache from a component is still fine: `useQueryClient`, and importing a query's options to build its cache key, are deliberately allowed.",
    },
    schema: [],
  },
  create(context) {
    const p = parsePath(filenameOf(context));
    if (!p.dir) return {};
    if (p.ext !== "tsx") return {};
    if (p.suffixes.includes("test") || p.suffixes.includes("spec")) return {};
    if (HOOK_FILE.test(p.stem)) return {};

    let bindings = new Map();
    return {
      Program(node) {
        bindings = importedBindings(node);
      },
      CallExpression(node) {
        const hit = fetchHookCall(node, bindings);
        if (!hit) return;
        context.report({
          node,
          messageId: "componentFetch",
          data: { file: p.base, hook: hit.imported },
        });
      },
    };
  },
};

// A `use-*` file is the data layer, not a component, even with a .tsx extension.
const HOOK_FILE = /^use[-A-Z]/;
