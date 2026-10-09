const {
  componentExport,
  componentName,
  isDefaultReExport,
  isComponentTsxFile,
} = require("./_component");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Component files read imports → Props → export default function → StyleSheet.create → " +
        "everything else, whichever way the component is exported.",
    },
    fixable: "whitespace",
    messages: {
      importAfterCode:
        "Imports come first — move this import above the rest of the file.",
      propsBelowComponent:
        "`Props` belongs right after the imports, immediately above the component — Props and the component name are read together in one pass.",
      beforeComponent:
        "'{{name}}' sits above the component. Order: imports → Props → component → styles → everything else. Move it below `styles` — readers reach the component before implementation detail.",
      stylesNotAfterComponent:
        "`const styles = StyleSheet.create(...)` belongs immediately after the component, not above it.",
      betweenComponentAndStyles:
        "'{{name}}' sits between the component and `styles`. Move it below `styles` — only values referenced inside `StyleSheet.create(...)` may sit here.",
      tdzBelowStyles:
        "'{{name}}' is referenced inside `styles` but declared after it — that throws a ReferenceError at import time. Move it between the component and `styles`.",
      blankBeforeComponent:
        "No blank line between `Props` and the component — they read as one unit.",
    },
    schema: [],
  },
  create(context) {
    if (!isComponentTsxFile(context)) return {};

    return {
      Program(program) {
        const body = program.body;
        const comp = componentExport(body);
        if (!comp) return;
        const compIdx = body.indexOf(comp);
        const compName = componentName(comp);
        const sourceCode = context.sourceCode;

        const stylesStmt = body.find(isStylesCreate) || null;
        const stylesIdx = stylesStmt ? body.indexOf(stylesStmt) : -1;
        const stylesRefs = new Set();
        if (stylesStmt)
          collectValueRefs(stylesStmt.declarations[0].init, stylesRefs);

        let propsStmt = null;
        let seenNonImport = false;

        body.forEach((stmt, i) => {
          if (typeof stmt.directive === "string") return;
          if (stmt.type === "ImportDeclaration") {
            if (seenNonImport)
              context.report({ node: stmt, messageId: "importAfterCode" });
            return;
          }
          seenNonImport = true;
          if (stmt === comp) return;
          if (isDefaultReExport(stmt, compName)) return;
          if (isProps(stmt, compName)) {
            propsStmt = stmt;
            if (i > compIdx)
              context.report({ node: stmt, messageId: "propsBelowComponent" });
            return;
          }
          if (stmt === stylesStmt) {
            // Below the component, any interloper between component and styles
            // gets its own report — flagging styles too would double-report.
            if (i < compIdx)
              context.report({
                node: stmt,
                messageId: "stylesNotAfterComponent",
              });
            return;
          }
          const name = declaredNames(stmt)[0] ?? "this statement";
          if (i < compIdx) {
            context.report({
              node: stmt,
              messageId: "beforeComponent",
              data: { name },
            });
            return;
          }
          if (stylesStmt && i < stylesIdx) {
            const exempt = declaredNames(stmt).some((n) => stylesRefs.has(n));
            if (!exempt)
              context.report({
                node: stmt,
                messageId: "betweenComponentAndStyles",
                data: { name },
              });
            return;
          }
          if (stylesStmt && i > stylesIdx) {
            const tdzName = declaredNames(stmt).find((n) => stylesRefs.has(n));
            if (tdzName)
              context.report({
                node: stmt,
                messageId: "tdzBelowStyles",
                data: { name: tdzName },
              });
          }
        });

        // The no-blank-line contract is only checkable once Props is the
        // statement directly above the component; until then the move reports
        // above already carry the fix.
        if (propsStmt && body[compIdx - 1] === propsStmt) {
          const comments = sourceCode
            .getCommentsBefore(comp)
            .filter((c) => c.range[0] > propsStmt.range[1]);
          const chain = [propsStmt, ...comments, comp];
          for (let k = 0; k + 1 < chain.length; k++) {
            const a = chain[k];
            const b = chain[k + 1];
            if (b.loc.start.line - a.loc.end.line > 1) {
              context.report({
                node: b.type ? b : comp,
                loc: { start: a.loc.end, end: b.loc.start },
                messageId: "blankBeforeComponent",
                fix(fixer) {
                  return fixer.replaceTextRange([a.range[1], b.range[0]], "\n");
                },
              });
            }
          }
        }
      },
    };
  },
};

/** Only names evaluated at module load count toward the TDZ exemption, so type
 * positions and non-computed keys are skipped. */
function collectValueRefs(node, out) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "Identifier") {
    out.add(node.name);
    return;
  }
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression"
  ) {
    collectValueRefs(node.expression, out);
    return;
  }
  if (node.type.startsWith("TS")) return;
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    if (node.type === "Property" && key === "key" && !node.computed) continue;
    if (
      node.type === "MemberExpression" &&
      key === "property" &&
      !node.computed
    )
      continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) collectValueRefs(c, out);
    } else if (v && typeof v.type === "string") {
      collectValueRefs(v, out);
    }
  }
}

// Only the component's own props type takes the slot above it; a DIFFERENT
// `XxxProps` belongs to a sub-component and moves below styles with it.
function isProps(stmt, compName) {
  const inner =
    stmt.type === "ExportNamedDeclaration" && stmt.declaration
      ? stmt.declaration
      : stmt;
  if (
    inner.type !== "TSInterfaceDeclaration" &&
    inner.type !== "TSTypeAliasDeclaration"
  )
    return false;
  if (!inner.id) return false;
  return (
    inner.id.name === "Props" ||
    (Boolean(compName) && inner.id.name === compName + "Props")
  );
}

function isStylesCreate(stmt) {
  if (stmt.type !== "VariableDeclaration" || stmt.declarations.length !== 1)
    return false;
  const d = stmt.declarations[0];
  return (
    d.id.type === "Identifier" &&
    d.id.name === "styles" &&
    d.init &&
    d.init.type === "CallExpression" &&
    d.init.callee.type === "MemberExpression" &&
    d.init.callee.object.type === "Identifier" &&
    d.init.callee.object.name === "StyleSheet" &&
    d.init.callee.property.type === "Identifier" &&
    d.init.callee.property.name === "create"
  );
}

function declaredNames(stmt) {
  const inner =
    stmt.type === "ExportNamedDeclaration" && stmt.declaration
      ? stmt.declaration
      : stmt;
  if (inner.type === "VariableDeclaration") {
    return inner.declarations
      .filter((d) => d.id.type === "Identifier")
      .map((d) => d.id.name);
  }
  return inner.id && inner.id.name ? [inner.id.name] : [];
}
