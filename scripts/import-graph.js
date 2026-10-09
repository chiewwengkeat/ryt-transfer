const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function readImportGraph(rootDir) {
  const modules = ["src", "modules"].flatMap((dir) =>
    listSourceModules(rootDir, dir, []),
  );
  const knownModules = new Set(modules);
  const edgesByModule = new Map();
  for (const file of modules) {
    const { uses, reexports } = readImportSpecifiers(rootDir, file);
    edgesByModule.set(file, {
      uses: uses.flatMap((specifier) =>
        resolveLocalSpecifier(file, specifier, knownModules),
      ),
      reexports: reexports.flatMap((specifier) =>
        resolveLocalSpecifier(file, specifier, knownModules),
      ),
    });
  }
  return edgesByModule;
}

module.exports = { readImportGraph };

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const PLATFORM_INFIXES = ["", ".ios", ".android", ".native"];

function listSourceModules(rootDir, relativeDir, found) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return found;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) listSourceModules(rootDir, relativePath, found);
    else if (
      MODULE_EXTENSIONS.includes(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    )
      found.push(relativePath);
  }
  return found;
}

function readImportSpecifiers(rootDir, file) {
  const text = fs.readFileSync(path.join(rootDir, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const uses = [];
  const reexports = [];
  // A name imported only to be exported again makes this file a pass-through, not a user.
  const specifierOfBinding = new Map();
  const reexportedBindings = new Set();
  const referencedBindings = new Set();
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const names = clause?.name ? [clause.name.text] : [];
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        names.push(clause.namedBindings.name.text);
      else if (clause?.namedBindings)
        names.push(...clause.namedBindings.elements.map((e) => e.name.text));
      if (names.length === 0) uses.push(node.moduleSpecifier.text);
      for (const name of names)
        specifierOfBinding.set(name, node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        reexports.push(node.moduleSpecifier.text);
      else if (node.exportClause && ts.isNamedExports(node.exportClause))
        for (const element of node.exportClause.elements)
          reexportedBindings.add((element.propertyName ?? element.name).text);
      return;
    }
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      reexportedBindings.add(node.expression.text);
      return;
    }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          ts.isIdentifier(declaration.initializer)
        ) {
          reexportedBindings.add(declaration.initializer.text);
          if (declaration.type) visit(declaration.type);
        } else {
          visit(declaration);
        }
      }
      return;
    }
    if (ts.isIdentifier(node)) referencedBindings.add(node.text);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      uses.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      uses.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [name, specifier] of specifierOfBinding) {
    const reexported = reexportedBindings.has(name);
    if (reexported) reexports.push(specifier);
    if (!reexported || referencedBindings.has(name)) uses.push(specifier);
  }
  return { uses, reexports };
}

function resolveLocalSpecifier(fromFile, specifier, knownModules) {
  let base;
  if (specifier.startsWith("@/"))
    base = path.posix.join("src", specifier.slice(2));
  else if (specifier.startsWith("."))
    base = path.posix.join(path.posix.dirname(fromFile), specifier);
  else return [];
  base = base.replace(/\/$/, "");
  const fileCandidatesOf = (stem) =>
    PLATFORM_INFIXES.flatMap((infix) =>
      MODULE_EXTENSIONS.map((ext) => stem + infix + ext),
    );
  // TypeScript's bundler resolution maps a .js or .jsx suffix onto the .ts or .tsx file.
  const typeScriptStem = base.replace(/\.jsx?$/, "");
  const asFile = [
    base,
    ...fileCandidatesOf(base),
    ...fileCandidatesOf(typeScriptStem),
  ].filter((candidate) => knownModules.has(candidate));
  if (asFile.length > 0) return asFile;
  return fileCandidatesOf(`${base}/index`).filter((candidate) =>
    knownModules.has(candidate),
  );
}
