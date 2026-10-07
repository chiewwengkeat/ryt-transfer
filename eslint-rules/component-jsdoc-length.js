const { componentExport, isComponentTsxFile } = require("./_component");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Component JSDoc stays short — name, folder, and Props carry the intent. Option " +
        "`requireSrcRoot` (default true) limits the rule to files under a `src/` root; " +
        "`recognizeAllExportShapes` (default false) also recognises the other component export shapes.",
    },
    messages: {
      tooLong:
        "This component JSDoc is {{n}} lines (max {{max}}). Name + folder + Props should carry the intent; keep only a short non-obvious why, or delete it.",
    },
    schema: [
      {
        type: "object",
        properties: {
          maxLines: { type: "integer", minimum: 1 },
          requireSrcRoot: { type: "boolean" },
          recognizeAllExportShapes: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = context.options[0] || {};
    if (!isComponentTsxFile(context, opts)) return {};
    const max = opts.maxLines || 4;

    return {
      Program(program) {
        const comp = componentExport(program.body, opts);
        if (!comp) return;
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const comments = sourceCode.getCommentsBefore(comp);
        const last = comments[comments.length - 1];
        if (!last || last.type !== "Block" || !last.value.startsWith("*"))
          return;
        const n = last.loc.end.line - last.loc.start.line + 1;
        if (n > max) {
          context.report({
            loc: last.loc,
            messageId: "tooLong",
            data: { n, max },
          });
        }
      },
    };
  },
};
