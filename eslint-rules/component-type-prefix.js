// Checks only the leading Type: the rest of a name needs a reader's recognition test.

// A closed vocabulary: a new Type is added here, never through the `types` option.
const DEFAULT_TYPES = [
  "Button",
  "Modal",
  "BottomSheet",
  "Card",
  "Item",
  "Loader",
  "Toast",
  "Banner",
  "Header",
  "Section",
  "Pill",
  "Chip",
  "Row",
  "Field",
  "Icon",
  "Label",
  "Overlay",
  "View",
  "Keypad",
  "Text",
];

/** True when `name` starts with `type` on a PascalCase word boundary, so
 * `Card` matches `CardPayment` and bare `Card` but not `Cardinal`. */
function hasTypePrefix(name, type) {
  if (!name.startsWith(type)) return false;
  const rest = name.slice(type.length);
  return rest === "" || /^[A-Z0-9]/.test(rest);
}

/** The Type a suffix-style name trails, e.g. `Modal` for `ModalErrorActivation`'s
 * mis-ordered twin `ActivationErrorModal`. Null when the name simply has no Type
 * anywhere, which needs the generic message instead of a reorder. */
function trailingType(name, types) {
  return types.find((t) => name.length > t.length && name.endsWith(t)) || null;
}

const isPascal = (n) => /^[A-Z][A-Za-z0-9]*$/.test(n);
const isFnExpr = (n) =>
  Boolean(n) &&
  (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression");

/** The single component this file names, or null when it names none or more than one.
 * Classes, call results, tagged templates and lowercase bindings never count. */
function fileComponentName(body) {
  for (const stmt of body) {
    if (stmt.type !== "ExportDefaultDeclaration") continue;
    const d = stmt.declaration;
    if (d.type === "FunctionDeclaration" && d.id && isPascal(d.id.name))
      return d.id.name;
    if (d.type === "CallExpression") {
      const inner = d.arguments.find(isFnExpr);
      if (inner && inner.id && isPascal(inner.id.name)) return inner.id.name;
    }
    if (d.type === "Identifier" && isPascal(d.name)) {
      const declared = body.some(
        (s) =>
          (s.type === "VariableDeclaration" &&
            s.declarations.some(
              (v) =>
                v.id.type === "Identifier" &&
                v.id.name === d.name &&
                isFnExpr(v.init),
            )) ||
          (s.type === "FunctionDeclaration" && s.id && s.id.name === d.name),
      );
      if (declared) return d.name;
    }
  }

  const named = [];
  for (const stmt of body) {
    if (stmt.type !== "ExportNamedDeclaration" || !stmt.declaration) continue;
    if (stmt.declaration.type !== "VariableDeclaration") continue;
    for (const v of stmt.declaration.declarations) {
      if (
        v.id.type === "Identifier" &&
        isPascal(v.id.name) &&
        isFnExpr(v.init)
      ) {
        named.push(v.id.name);
      }
    }
  }
  // ⛔ No default and two candidates stays unjudged on purpose — never pick one.
  return named.length === 1 ? named[0] : null;
}

// A route file is named for its URL (`[transferId].tsx`, `_layout.tsx`), so the
// filename check never enters these directories.
const DEFAULT_ROUTE_DIRS = ["pages", "app"];

function inRouteDir(filename, routeDirs) {
  return filename
    .split("/")
    .slice(0, -1)
    .some((seg) => routeDirs.includes(seg));
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Component names lead with their Type — `{Type}{Purpose}{Feature}{Variant}`, " +
        "no suffix-style names (`ButtonNavHome`, not `HomeNavTile`). Options: `types` " +
        "replaces the default Type vocabulary; `exempt` lists names to skip verbatim " +
        "(well-known framework and library components keep their upstream spelling); " +
        "`allowScreenSuffix` (default true) skips `*Screen` files. " +
        "`requireFilenameMatchesComponent` (default false) also requires a component file to " +
        "be named after the component it exports, which implies PascalCase; a file is checked " +
        "only when it names exactly one component, and `index.tsx` is skipped as a module " +
        'entry point. `routeDirs` (default ["pages", "app"]) names directories whose ' +
        "filenames the framework owns and which the filename check never enters.",
    },
    messages: {
      typePrefix:
        "Component '{{name}}' does not lead with a Type. Names read {Type}{Purpose}{Feature}{Variant} — Type first (`ButtonNavHome`, not `HomeNavTile`). Valid Types: {{types}}. If this is a framework or library component keeping its upstream spelling, add it to this rule's `exempt` option.",
      typeSuffix:
        "Component '{{name}}' is suffix-style — it ends with the Type '{{type}}' instead of leading with it. Rename it to '{{suggested}}' (and its file and folder to match). Type first is what lets a reader scan a folder and see what each file is.",
      filenameMismatch:
        "This file exports the component '{{component}}' but is named '{{base}}'. Rename the file to '{{component}}.tsx': the function name, the file name and the folder name all match, so a component can be found from its filename alone.",
    },
    schema: [
      {
        type: "object",
        properties: {
          types: { type: "array", items: { type: "string" }, minItems: 1 },
          exempt: { type: "array", items: { type: "string" } },
          allowScreenSuffix: { type: "boolean" },
          requireFilenameMatchesComponent: { type: "boolean" },
          routeDirs: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    );
    if (!filename.endsWith(".tsx")) return {};

    const base = filename.slice(filename.lastIndexOf("/") + 1);
    if (base.includes(".test.") || base.includes(".spec.")) return {};

    const name = base.slice(0, -".tsx".length);
    const opts = context.options[0] || {};
    const types = opts.types || DEFAULT_TYPES;
    const exempt = opts.exempt || [];

    // The Type check reads the filename, so it only applies to a file already
    // named for its component. `index.tsx`, `use-foo.tsx` and kebab-case files
    // are named by other conventions and the filename check below owns them.
    const namedForComponent = /^[A-Z][A-Za-z0-9]*$/.test(name);

    // `index.tsx` is a module entry point, not a component filename — the folder
    // carries the name, and this rule does not lint folder names.
    const wantFilename =
      opts.requireFilenameMatchesComponent === true &&
      name !== "index" &&
      !inRouteDir(filename, opts.routeDirs || DEFAULT_ROUTE_DIRS);

    if (!wantFilename && !namedForComponent) return {};

    return {
      Program(node) {
        // Filename first: until the file is named for its component, the Type
        // check has no reliable name to read. Reporting both at once would give
        // two errors for one fix.
        if (wantFilename) {
          const component = fileComponentName(node.body);
          if (component && component !== name) {
            context.report({
              node,
              messageId: "filenameMismatch",
              data: { component, base },
            });
            return;
          }
        }

        if (!namedForComponent) return;
        if (exempt.includes(name)) return;
        // Screens are named `<Domain><Purpose>Screen`, which the Type rule must not fight.
        if (opts.allowScreenSuffix !== false && name.endsWith("Screen")) return;

        // Longest first, so a caller-supplied `types` containing both `Card` and
        // `CardMini` resolves to the more specific one.
        const sorted = [...types].sort((a, b) => b.length - a.length);
        if (sorted.some((t) => hasTypePrefix(name, t))) return;

        const trailing = trailingType(name, sorted);
        if (trailing) {
          context.report({
            node,
            messageId: "typeSuffix",
            data: {
              name,
              type: trailing,
              suggested: trailing + name.slice(0, -trailing.length),
            },
          });
          return;
        }
        context.report({
          node,
          messageId: "typePrefix",
          data: { name, types: types.join(", ") },
        });
      },
    };
  },
};
