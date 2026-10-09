const { componentExport, isComponentTsxFile } = require("./_component");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Component JSDoc stays short — name, folder, and Props carry the intent.",
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
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    if (!isComponentTsxFile(context)) return {};
    const max = (context.options[0] || {}).maxLines || 4;

    return {
      Program(program) {
        const comp = componentExport(program.body);
        if (!comp) return;
        const comments = context.sourceCode.getCommentsBefore(comp);
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
