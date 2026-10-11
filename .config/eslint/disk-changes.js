// Lets an editor's long-running ESLint see files that change on disk, as each `pnpm lint` run does:
// typescript-eslint and the TypeScript import resolver read a file once and keep it, so the editor would
// otherwise report against files as they stood when it started.
const fs = require("node:fs");
const path = require("node:path");
const tseslint = require("typescript-eslint");

const typescriptParser = {
  meta: {
    name: "typescript-parser-reloading",
    version: tseslint.parser.meta?.version,
  },
  parseForESLint(code, options) {
    const state = options?.projectService && watch(options.tsconfigRootDir);
    if (state) {
      const filePath = path.resolve(options.filePath);
      if (changedOutsideEditor(state, filePath, code)) clearTypeScriptCaches();
      state.parsed.set(filePath, code);
    }
    return tseslint.parser.parseForESLint(code, options);
  },
};

function typescriptImportResolver(options) {
  let resolver;
  let loaded;
  return {
    interfaceVersion: 3,
    name: "eslint-import-resolver-typescript",
    resolve(source, file) {
      const module = resolverModule(options);
      if (module !== loaded) {
        resolver = module.createTypeScriptImportResolver(options);
        loaded = module;
      }
      return resolver.resolve(source, file);
    },
  };
}

module.exports = {
  // eslint-plugin-boundaries loads its resolver by path, through the older interface.
  interfaceVersion: 2,
  resolve: (source, file, options) =>
    resolverModule(options).resolve(source, file, options),
  typescriptParser,
  typescriptImportResolver,
  // import-x and eslint-plugin-boundaries otherwise keep a resolution for 30 seconds.
  importCache: oneShot() ? {} : { lifetime: 0 },
};

const IGNORED =
  /^(\.git|\.claude|ios|android|dist|coverage|node_modules\/\.cache|\.expo\/(?!types\/))(\/|$)/;
const COUNTED = /(\.(ts|tsx|js|mjs|cjs|json)|\/[^./]+)$/;
const STATES = new Map();
const RESOLVER_PATH = require.resolve("eslint-import-resolver-typescript");

// A one-off run sees no file change; typescript-eslint draws the same line for its own watching.
function oneShot() {
  return (
    process.env.CI === "true" ||
    ["node_modules/.bin/eslint", "node_modules/eslint/bin/eslint.js"].some(
      (bin) => process.argv[1]?.endsWith(path.normalize(bin)) ?? false,
    )
  );
}

function watch(root) {
  if (oneShot() || !root) return undefined;
  const key = path.resolve(root);
  if (STATES.has(key)) return STATES.get(key);
  const state = { changed: new Set(), parsed: new Map(), moves: 0 };
  try {
    // Not unref(): on Linux, Node's recursive watcher ignores it and keeps the process alive.
    fs.watch(key, { recursive: true, persistent: false }, (event, filename) => {
      const relative = filename?.split(path.sep).join("/");
      if (!relative || IGNORED.test(relative) || !COUNTED.test(`/${relative}`))
        return;
      state.changed.add(path.join(key, relative));
      if (event === "rename") state.moves++;
    });
  } catch {
    STATES.set(key, undefined);
    return undefined;
  }
  STATES.set(key, state);
  return state;
}

// A file whose disk text is what the editor last handed the parser is the editor's own save, which
// typescript-eslint already holds.
function changedOutsideEditor(state, filePath, code) {
  const changed = [...state.changed];
  state.changed.clear();
  return changed.some((file) => {
    const editorText = file === filePath ? code : state.parsed.get(file);
    return editorText === undefined || readOrNull(file) !== editorText;
  });
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function clearTypeScriptCaches() {
  const parser = require.resolve("@typescript-eslint/parser", {
    paths: [path.dirname(require.resolve("typescript-eslint"))],
  });
  require(
    require.resolve("@typescript-eslint/typescript-estree", {
      paths: [path.dirname(parser)],
    }),
  ).clearCaches();
}

// The resolver keeps its file lookups in module-level maps, so a fresh load is the only way to drop them.
function resolverModule(options) {
  const state = watch(path.dirname(options.project));
  if (state && state.resolverMoves !== state.moves) {
    delete require.cache[RESOLVER_PATH];
    state.resolverMoves = state.moves;
  }
  return require(RESOLVER_PATH);
}
