/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "layout",
    docs: {
      description:
        "A file's imports, import statements and top-level requires alike, form one block with no " +
        "blank line inside it. The one blank line allowed follows a side-effect import that opens " +
        "the block, so it stays first.",
    },
    fixable: "whitespace",
    messages: {
      blankLine:
        "Remove the blank line between these imports. Organize Imports sorts each block of imports apart and never removes a blank line, so a blank line leaves the file's imports half sorted. Only a side-effect import that must load first, opening the block, keeps a blank line after it.",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program(program) {
        const first = program.body.find(isImportStatement);
        program.body.forEach((statement, i) => {
          const previous = program.body[i - 1];
          if (!previous || !isImportStatement(previous)) return;
          if (!isImportStatement(statement)) return;
          if (previous === first && isSideEffectImport(previous)) return;
          const gaps = whitespaceOutsideComments(
            sourceCode,
            previous,
            statement,
          );
          if (
            !gaps.some(([start, end]) =>
              hasBlankLine(sourceCode.text.slice(start, end)),
            )
          )
            return;
          context.report({
            node: statement,
            messageId: "blankLine",
            fix: (fixer) =>
              gaps.map(([start, end]) =>
                fixer.replaceTextRange(
                  [start, end],
                  sourceCode.text
                    .slice(start, end)
                    .replace(/\n([ \t\r]*\n)+/g, "\n"),
                ),
              ),
          });
        });
      },
    };
  },
};

function isImportStatement(node) {
  if (node.type === "ImportDeclaration") return true;
  if (node.type === "ExpressionStatement")
    return isStaticRequire(node.expression);
  return (
    node.type === "VariableDeclaration" &&
    node.declarations.every((declarator) => startsWithRequire(declarator.init))
  );
}

function isSideEffectImport(node) {
  if (node.type === "ImportDeclaration") return node.specifiers.length === 0;
  return node.type === "ExpressionStatement";
}

function startsWithRequire(node) {
  let current = node;
  while (current && current.type === "MemberExpression")
    current = current.object;
  return isStaticRequire(current);
}

function isStaticRequire(node) {
  if (!node || node.type !== "CallExpression") return false;
  if (node.callee.type !== "Identifier" || node.callee.name !== "require")
    return false;
  const [argument] = node.arguments;
  return (
    node.arguments.length === 1 &&
    ((argument.type === "Literal" && typeof argument.value === "string") ||
      (argument.type === "TemplateLiteral" &&
        argument.expressions.length === 0))
  );
}

function whitespaceOutsideComments(sourceCode, previous, statement) {
  const runs = [];
  let start = previous.range[1];
  for (const comment of sourceCode.getAllComments()) {
    if (comment.range[0] < start || comment.range[1] > statement.range[0])
      continue;
    runs.push([start, comment.range[0]]);
    start = comment.range[1];
  }
  runs.push([start, statement.range[0]]);
  return runs;
}

function hasBlankLine(text) {
  return /\n[ \t\r]*\n/.test(text);
}
