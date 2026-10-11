const {
  componentExport,
  componentName,
  isComponentTsxFile,
  isDefaultReExport,
  isFnExpr,
  memoOrForwardRefName,
} = require("./_component");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A component file declares no component, hook or function at module level but the component itself.",
    },
    messages: {
      helperBesideComponent:
        "{{kind}} '{{name}}' sits beside the component. A component file holds only the component, its Props, its styles, and constants, types and contexts: inline '{{name}}' into its user's body, or give it a folder of its own.",
    },
    schema: [],
  },
  create(context) {
    if (!isComponentTsxFile(context)) return {};

    return {
      Program(program) {
        const comp = componentExport(program.body);
        if (!comp) return;
        const compName = componentName(comp);
        for (const stmt of program.body) {
          if (stmt === comp || isDefaultReExport(stmt, compName)) continue;
          for (const name of declaredFunctionNames(stmt)) {
            context.report({
              node: stmt,
              messageId: "helperBesideComponent",
              data: { kind: kindOfFunction(name), name },
            });
          }
        }
      },
    };
  },
};

function declaredFunctionNames(stmt) {
  const inner =
    (stmt.type === "ExportNamedDeclaration" ||
      stmt.type === "ExportDefaultDeclaration") &&
    stmt.declaration
      ? stmt.declaration
      : stmt;
  if (inner.type === "FunctionDeclaration")
    return [inner.id ? inner.id.name : "default"];
  if (inner.type !== "VariableDeclaration") return [];
  return inner.declarations
    .filter(
      (v) =>
        v.id.type === "Identifier" &&
        (isFnExpr(v.init) ||
          (v.init &&
            v.init.type === "CallExpression" &&
            memoOrForwardRefName(v.init.callee))),
    )
    .map((v) => v.id.name);
}

function kindOfFunction(name) {
  if (/^use[A-Z0-9]/.test(name)) return "Hook";
  if (/^[A-Z]/.test(name)) return "Component";
  return "Function";
}
