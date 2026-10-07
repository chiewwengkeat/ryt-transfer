const { filenameOf } = require("./_paths");

/** PascalCase or anonymous: a default-exported `useThing` is a hook module, which these rules leave alone. */
function isComponentName(name) {
  return !name || /^[A-Z]/.test(name);
}

const isFnExpr = (n) =>
  Boolean(n) &&
  (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression");

const WRAPPERS = new Set(["memo", "forwardRef"]);

function memoOrForwardRefName(callee) {
  if (callee.type === "Identifier")
    return WRAPPERS.has(callee.name) ? callee.name : "";
  if (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier"
  )
    return WRAPPERS.has(callee.property.name) ? callee.property.name : "";
  return "";
}

/** Taken by POSITION from `arguments[0]`: scanning for the first function picks the
 * comparator out of `memo(Chip, areEqual)`, and the empty name then misplaces `ChipProps`. */
function componentNameInsideWrapper(d) {
  const first = d.arguments[0];
  if (!first) return "";
  if (isFnExpr(first)) return first.id ? first.id.name : "";
  if (first.type === "Identifier") return first.name;
  if (first.type === "CallExpression" && memoOrForwardRefName(first.callee))
    return componentNameInsideWrapper(first);
  return "";
}

/** The superclass check is load-bearing: a default-exported model class in a .tsx file is not a component. */
function isReactClass(d) {
  const s = d.superClass;
  if (!s) return false;
  const base =
    s.type === "Identifier"
      ? s.name
      : s.type === "MemberExpression" && s.property.type === "Identifier"
        ? s.property.name
        : "";
  return base === "Component" || base === "PureComponent";
}

/** Layout order is measured from whatever this returns, so it must be the
 * declaration: keying on the `export default Foo` line instead would put every
 * statement above it, styles included, "before the component". */
function localComponentDecl(body, name) {
  for (const stmt of body) {
    const inner =
      stmt.type === "ExportNamedDeclaration" && stmt.declaration
        ? stmt.declaration
        : stmt;
    if (
      inner.type === "FunctionDeclaration" &&
      inner.id &&
      inner.id.name === name
    )
      return stmt;
    if (
      inner.type === "ClassDeclaration" &&
      inner.id &&
      inner.id.name === name &&
      isReactClass(inner)
    )
      return stmt;
    if (
      inner.type === "VariableDeclaration" &&
      inner.declarations.some(
        (v) =>
          v.id.type === "Identifier" && v.id.name === name && isFnExpr(v.init),
      )
    )
      return stmt;
  }
  return null;
}

function defaultSpecifier(stmt) {
  if (
    stmt.type !== "ExportNamedDeclaration" ||
    stmt.declaration ||
    !stmt.specifiers
  )
    return null;
  return (
    stmt.specifiers.find(
      (s) =>
        s.exported &&
        s.exported.name === "default" &&
        s.local.type === "Identifier" &&
        isComponentName(s.local.name),
    ) || null
  );
}

function componentExport(body) {
  for (const stmt of body) {
    const spec = defaultSpecifier(stmt);
    if (spec) {
      const decl = localComponentDecl(body, spec.local.name);
      if (decl) return decl;
    }
    if (stmt.type !== "ExportDefaultDeclaration") continue;
    const d = stmt.declaration;
    if (d.type === "FunctionDeclaration") {
      return isComponentName(d.id ? d.id.name : "") ? stmt : null;
    }
    if (d.type === "CallExpression" && memoOrForwardRefName(d.callee)) {
      const inner = d.arguments.find(isFnExpr);
      if (inner && isComponentName(inner.id ? inner.id.name : "")) return stmt;
      if (isComponentName(componentNameInsideWrapper(d))) return stmt;
      return null;
    }
    if (isFnExpr(d))
      return isComponentName(d.id ? d.id.name : "") ? stmt : null;
    if (d.type === "ClassDeclaration")
      return isReactClass(d) && isComponentName(d.id ? d.id.name : "")
        ? stmt
        : null;
    if (d.type === "Identifier")
      return isComponentName(d.name) ? localComponentDecl(body, d.name) : null;
  }

  // A lone `export const Foo = () => …`. Two or more candidates is ambiguous and
  // yields null rather than a guess, matching `component-type-prefix`.
  const named = [];
  for (const stmt of body) {
    if (stmt.type !== "ExportNamedDeclaration" || !stmt.declaration) continue;
    if (stmt.declaration.type !== "VariableDeclaration") continue;
    for (const v of stmt.declaration.declarations) {
      if (
        v.id.type === "Identifier" &&
        isComponentName(v.id.name) &&
        isFnExpr(v.init)
      )
        named.push(stmt);
    }
  }
  return named.length === 1 ? named[0] : null;
}

function componentName(comp) {
  const d =
    comp.type === "ExportDefaultDeclaration" ||
    comp.type === "ExportNamedDeclaration"
      ? comp.declaration
      : comp;
  if (!d) return "";
  if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration")
    return d.id ? d.id.name : "";
  if (isFnExpr(d)) return d.id ? d.id.name : "";
  if (d.type === "CallExpression") return componentNameInsideWrapper(d);
  if (d.type === "VariableDeclaration") {
    const v = d.declarations.find(
      (x) => x.id.type === "Identifier" && isFnExpr(x.init),
    );
    return v ? v.id.name : "";
  }
  return "";
}

/** The `export default Foo` / `export { Foo as default }` line for a component
 * declared above it — a re-export, not a statement of its own, so the layout
 * order must not treat it as detail that drifted below the component. */
function isDefaultReExport(stmt, name) {
  if (!name) return false;
  if (stmt.type === "ExportDefaultDeclaration")
    return (
      stmt.declaration.type === "Identifier" && stmt.declaration.name === name
    );
  const spec = defaultSpecifier(stmt);
  return Boolean(spec) && spec.local.name === name;
}

function isComponentTsxFile(context) {
  const filename = filenameOf(context);
  if (!filename.endsWith(".tsx")) return false;
  const base = filename.slice(filename.lastIndexOf("/") + 1);
  return !base.includes(".test.") && !base.includes(".spec.");
}

module.exports = {
  componentExport,
  componentName,
  isDefaultReExport,
  isComponentTsxFile,
  isFnExpr,
};
