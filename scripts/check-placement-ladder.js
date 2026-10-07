const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const PLATFORM_INFIXES = ["", ".ios", ".android", ".native"];
const TEST_FILE = /(\.(test|spec)\.[jt]sx?$)|(\/__tests__\/)/;

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
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      uses.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      reexports.push(node.moduleSpecifier.text);
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
  return { uses, reexports };
}

function resolveLocalSpecifier(fromFile, specifier, knownModules) {
  let base;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("."))
    base = path.posix.join(path.posix.dirname(fromFile), specifier);
  else return [];
  const variantsOf = (stem) =>
    PLATFORM_INFIXES.flatMap((infix) =>
      MODULE_EXTENSIONS.map((ext) => stem + infix + ext),
    );
  const asFile = [base, ...variantsOf(base)].filter((candidate) =>
    knownModules.has(candidate),
  );
  if (asFile.length > 0) return asFile;
  return variantsOf(`${base}/index`).filter((candidate) =>
    knownModules.has(candidate),
  );
}

function findSubjectOfModule(file) {
  const parts = file.split("/");
  if (parts[1] !== "screens" && parts[1] !== "domains") return null;
  for (let i = parts.length - 2; i >= 2; i -= 1) {
    if (parts[i] === "components" || parts[i] === "hooks") {
      return {
        path: parts.slice(0, i + 2).join("/"),
        container: parts.slice(0, i + 1).join("/"),
        kind: parts[i],
        isFile: i + 2 === parts.length,
      };
    }
  }
  return null;
}

function findOwnerFolderOf(directory) {
  const parts = directory.split("/");
  for (let length = parts.length; length >= 3; length -= 1) {
    const candidate = parts.slice(0, length);
    const isScreenFolder =
      length === 4 &&
      candidate[1] === "screens" &&
      candidate[3].endsWith("Screen");
    const isComponentFolder = candidate[length - 2] === "components";
    const isSliceFolder =
      length === 3 && ["screens", "domains"].includes(candidate[1]);
    if (isScreenFolder || isComponentFolder || isSliceFolder)
      return candidate.join("/");
  }
  return null;
}

function findCommonDirectory(files) {
  const directoryParts = files.map((file) =>
    path.posix.dirname(file).split("/"),
  );
  const common = [];
  for (
    let i = 0;
    directoryParts.every(
      (parts) => i < parts.length && parts[i] === directoryParts[0][i],
    );
    i += 1
  )
    common.push(directoryParts[0][i]);
  return common.join("/");
}

function checkPlacementLadder(rootDir) {
  const modules = listSourceModules(rootDir, "src", []);
  const knownModules = new Set(modules);
  const appModules = modules.filter(
    (file) => !TEST_FILE.test(file) && !file.startsWith("src/test/"),
  );

  const edgesByModule = new Map();
  for (const file of appModules) {
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

  const subjects = new Map();
  for (const file of appModules) {
    const subject = findSubjectOfModule(file);
    if (!subject) continue;
    if (!subjects.has(subject.path))
      subjects.set(subject.path, { ...subject, files: [] });
    subjects.get(subject.path).files.push(file);
  }

  const failures = [];
  for (const subject of subjects.values()) {
    // A route counts as a user through a re-export: the router imports it, not app code.
    const reachableThrough = new Set(subject.files);
    for (let grew = true; grew;) {
      grew = false;
      for (const [file, edges] of edgesByModule) {
        if (reachableThrough.has(file) || file.startsWith("src/app/")) continue;
        if (edges.reexports.some((target) => reachableThrough.has(target))) {
          reachableThrough.add(file);
          grew = true;
        }
      }
    }

    const users = [];
    for (const [file, edges] of edgesByModule) {
      const insideSubject = subject.isFile
        ? file === subject.path
        : file.startsWith(`${subject.path}/`);
      const viaRoute =
        file.startsWith("src/app/") &&
        edges.reexports.some((t) => reachableThrough.has(t));
      if (
        !insideSubject &&
        (viaRoute || edges.uses.some((t) => reachableThrough.has(t)))
      )
        users.push(file);
    }

    if (users.length === 0) {
      failures.push(
        `${subject.path}: no app code uses it, and tests do not count - add it in the commit that adds its first user`,
      );
      continue;
    }

    const usedOutsideSlices = users.some(
      (file) => !/^src\/(screens|domains)\//.test(file),
    );
    const owner = usedOutsideSlices
      ? null
      : findOwnerFolderOf(findCommonDirectory(users));
    const shownUsers =
      users.slice(0, 3).join(", ") + (users.length > 3 ? ", ..." : "");
    if (owner === null) {
      if (
        !new RegExp(`^src/domains/[^/]+/${subject.kind}$`).test(
          subject.container,
        )
      ) {
        failures.push(
          `${subject.path}: used across screens folders or outside them (${shownUsers}) - it belongs in src/domains/<area>/${subject.kind}/`,
        );
      }
    } else if (subject.container !== `${owner}/${subject.kind}`) {
      failures.push(
        `${subject.path}: every user sits in ${owner}/ (${shownUsers}) - it belongs in ${owner}/${subject.kind}/`,
      );
    }
  }
  return { subjectCount: subjects.size, failures: failures.sort() };
}

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const { subjectCount, failures } = checkPlacementLadder(rootDir);
for (const failure of failures) console.error(failure);
console.log(
  `placement ladder: ${subjectCount} components and hooks checked, ${failures.length} misplaced`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
