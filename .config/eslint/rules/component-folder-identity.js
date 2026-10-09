const { dirEntries, filenameOf, parsePath } = require("./_paths");

const PASCAL_STEM = /^[A-Z][A-Za-z0-9]*$/;
const PASCAL_COMPONENT_FILE = /^[A-Z][A-Za-z0-9]*\.tsx$/;

// A route file is named for its URL, not a component, so it has no folder to match.
const ROUTE_DIR = "/src/app/";

function isComponentFile(name) {
  return (
    PASCAL_COMPONENT_FILE.test(name) &&
    !name.includes(".test.") &&
    !name.includes(".spec.")
  );
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a component's folder to be named exactly for the component it holds, so the path " +
        "identifies the component before any file is opened and its colocated siblings have one " +
        "name to track. A component sharing a folder with another component is the same defect " +
        "seen from the other side — it is a child that never got its own folder — so both are " +
        "reported here, with the remedy chosen by what else the folder contains. Files directly " +
        "inside `components/` are left to `component-own-folder`, which already owns that " +
        "position. Dot-suffixed files (`Foo.type.tsx`) are left to " +
        "`sibling-basename-tracks-folder`, which names the file rather than the folder. " +
        "Route files under src/app/ are named for a URL and skipped.",
    },
    messages: {
      folderIdentity:
        "Component '{{file}}' sits in '{{parent}}/', a folder named for something else. A component folder is PascalCase and named exactly for its component, so every colocated sibling here can take that one name. Rename the folder to '{{stem}}/' — and rename its siblings ('{{parent}}.helper.ts', '{{parent}}.type.ts', …) to '{{stem}}.*' with it.",
      childOwnFolder:
        "Component '{{file}}' sits beside another component in '{{parent}}/'. A child component gets its own folder under a sibling components/ directory, never a flat file beside its parent. Move it to '{{parent}}/components/{{stem}}/{{file}}'.",
    },
    schema: [],
  },
  create(context) {
    const p = parsePath(filenameOf(context));

    if (p.ext !== "tsx") return {};
    if (p.suffixes.includes("test") || p.suffixes.includes("spec")) return {};
    // `Foo.type.tsx` belongs to sibling-basename-tracks-folder, which says rename
    // the FILE. Reporting here too puts two opposite remedies on one file.
    if (p.suffixes.length > 0) return {};
    if (!PASCAL_STEM.test(p.stem)) return {};
    if (!p.dir) return {};
    if (p.path.includes(ROUTE_DIR)) return {};
    // component-own-folder already reports this position; without this arm a flat
    // child draws two errors for one defect.
    if (p.parent === "components" || p.parent === "component") return {};

    if (p.parent === p.stem) return {};

    // Reached only after the decision to report, so `--stdin` (where dirEntries
    // is []) still fires, as folderIdentity. Gating on it above would go inert
    // there. Dropping the self filter makes a lone component its own sibling.
    const entries = dirEntries(p.dir).filter((n) => n !== p.base);
    const beside =
      entries.includes(p.parent + ".tsx") || entries.some(isComponentFile);

    return {
      Program(node) {
        context.report({
          node,
          messageId: beside ? "childOwnFolder" : "folderIdentity",
          data: { file: p.base, parent: p.parent, stem: p.stem },
        });
      },
    };
  },
};
