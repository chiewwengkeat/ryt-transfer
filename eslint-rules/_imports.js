const NAMESPACE = "*";
const DEFAULT = "default";

const FETCH_MODULES = ["@tanstack/react-query"];
const FETCH_HOOKS = ["useQuery", "useMutation", "useInfiniteQuery"];

function importedName(spec) {
  if (spec.type === "ImportDefaultSpecifier") return DEFAULT;
  if (spec.type === "ImportNamespaceSpecifier") return NAMESPACE;
  return spec.imported.type === "Identifier"
    ? spec.imported.name
    : spec.imported.value;
}

/** Resolving a call to its import keeps a fetch-hook rule off a prop that merely looks
 * like a hook (`useQueryResult`). No scope analysis: a shadowing local reads as the import. */
function importedBindings(programNode) {
  const bindings = new Map();
  for (const stmt of programNode.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    for (const spec of stmt.specifiers) {
      bindings.set(spec.local.name, {
        local: spec.local.name,
        imported: importedName(spec),
        source: stmt.source.value,
        typeOnly: stmt.importKind === "type" || spec.importKind === "type",
        node: spec,
      });
    }
  }
  return bindings;
}

function calleeBinding(callNode, bindings) {
  const callee = callNode.callee;
  if (callee.type === "Identifier") {
    const b = bindings.get(callee.name);
    return b && b.imported !== NAMESPACE ? b : null;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.property.type === "Identifier"
  ) {
    const b = bindings.get(callee.object.name);
    if (b && b.imported === NAMESPACE)
      return { ...b, imported: callee.property.name };
  }
  return null;
}

/** The binding when this call fetches over the wire, rather than importing a
 * helper, an options object or `useQueryClient`. */
function fetchHookCall(callNode, bindings, opts = {}) {
  const b = calleeBinding(callNode, bindings);
  if (!b || b.typeOnly) return null;
  if (!(opts.modules || FETCH_MODULES).includes(b.source)) return null;
  return (opts.hooks || FETCH_HOOKS).includes(b.imported) ? b : null;
}

/** Every module this file names, re-exports included — `export { X } from
 * "../Bar/internal"` reaches into another folder exactly as an import does. */
function moduleSources(programNode) {
  const out = [];
  for (const node of programNode.body) {
    const isImport = node.type === "ImportDeclaration";
    const isExport =
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration";
    if (!node.source || (!isImport && !isExport)) continue;
    out.push({
      node,
      source: node.source.value,
      kind: isImport ? "import" : "export",
      typeOnly: node.importKind === "type" || node.exportKind === "type",
    });
  }
  return out;
}

module.exports = {
  DEFAULT,
  FETCH_HOOKS,
  FETCH_MODULES,
  NAMESPACE,
  calleeBinding,
  fetchHookCall,
  importedBindings,
  moduleSources,
};
