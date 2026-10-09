const { componentExport, isComponentTsxFile } = require("./_component");
const { filenameOf } = require("./_paths");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Main first in every file component-layout does not order: a module's exports above its " +
        "private declarations, a test file's setup and tests above its helpers, a script's run " +
        "statements above its helpers.",
    },
    messages: {
      privateBeforeExport:
        "'{{name}}' is private but sits above an export. Move it below the exports, so the file opens with what it exports. If the file reads it while it loads, it stays above its reader: mark it with `// eslint-disable-next-line fe/file-layout -- read at load by <reader>`.",
      setupAfterTests:
        "This setup sits below the first test. Move it above the tests, beside the imports and the other setup. If it must run where it is, mark it with `// eslint-disable-next-line fe/file-layout -- <why it runs here>`.",
      helperBeforeTests:
        "'{{name}}' sits above a test. Move it below the last test, so the file opens with its tests. If the file reads it while it loads (a describe callback, an .each table, a RuleTester run), it stays above its reader: mark it with `// eslint-disable-next-line fe/file-layout -- read at load by <reader>`.",
      helperBeforeMain:
        "'{{name}}' sits above the script's first run statement. Move it below the run statements, so the script opens with what it does. If they read it while the file loads, it stays above them: mark it with `// eslint-disable-next-line fe/file-layout -- read at load by <reader>`.",
    },
    schema: [],
  },
  create(context) {
    const filename = filenameOf(context);
    if (filename.endsWith(".d.ts") || /(^|\/)src\/app\//.test(filename))
      return {};
    return {
      Program(program) {
        if (isComponentTsxFile(context) && componentExport(program.body))
          return;
        const statements = program.body.filter(
          (statement) => typeof statement.directive !== "string",
        );
        const classes = classifyStatements(statements);
        if (/\.(test|spec)\.[^./]+$/.test(filename))
          reportTestFileOrder(context, statements, classes);
        else if (classes.includes("export"))
          reportModuleOrder(context, statements, classes);
        else reportScriptOrder(context, statements, classes);
      },
    };
  },
};

const TEST_ROOTS = new Set(["describe", "it", "test", "scenarioTest"]);
const TEST_MODIFIERS = new Set([
  "each",
  "skip",
  "only",
  "todo",
  "concurrent",
  "failing",
]);
const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const DECLARATIONS = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
  "VariableDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSDeclareFunction",
]);

function reportModuleOrder(context, statements, classes) {
  const lastExport = classes.lastIndexOf("export");
  statements.forEach((statement, i) => {
    if (classes[i] === "declaration" && i < lastExport)
      context.report({
        node: statement,
        messageId: "privateBeforeExport",
        data: { name: nameOf(statement) },
      });
  });
}

function reportTestFileOrder(context, statements, classes) {
  const ruleTesters = namesBoundToRuleTesters(statements);
  const kinds = statements.map((statement, i) => {
    if (classes[i] !== "other") return classes[i];
    if (containsTest(statement, ruleTesters)) return "test";
    return statement.type === "ExpressionStatement" ? "setup" : "other";
  });
  const firstTest = kinds.indexOf("test");
  const lastTest = kinds.lastIndexOf("test");
  statements.forEach((statement, i) => {
    if (kinds[i] === "setup" && firstTest !== -1 && i > firstTest)
      context.report({ node: statement, messageId: "setupAfterTests" });
    if (kinds[i] === "declaration" && i < lastTest)
      context.report({
        node: statement,
        messageId: "helperBeforeTests",
        data: { name: nameOf(statement) },
      });
  });
}

function reportScriptOrder(context, statements, classes) {
  const firstRun = statements.findIndex(
    (statement, i) =>
      classes[i] === "other" && statement.type !== "EmptyStatement",
  );
  statements.forEach((statement, i) => {
    if (classes[i] === "declaration" && i < firstRun)
      context.report({
        node: statement,
        messageId: "helperBeforeMain",
        data: { name: nameOf(statement) },
      });
  });
}

function classifyStatements(statements) {
  const exportedNames = namesExportedByListsAndAssignments(statements);
  return statements.map((statement) => {
    if (isImport(statement)) return "import";
    if (isExportStatement(statement)) return "export";
    if (!DECLARATIONS.has(statement.type)) return "other";
    return namesDeclaredBy(statement).some((name) => exportedNames.has(name))
      ? "export"
      : "declaration";
  });
}

function isImport(statement) {
  if (statement.type === "ImportDeclaration") return true;
  if (statement.type === "TSImportEqualsDeclaration")
    return statement.moduleReference.type === "TSExternalModuleReference";
  return (
    statement.type === "VariableDeclaration" &&
    statement.declarations.every((declarator) => isRequire(declarator.init))
  );
}

function isRequire(expression) {
  let current = expression;
  while (current && current.type === "MemberExpression")
    current = current.object;
  return (
    Boolean(current) &&
    current.type === "CallExpression" &&
    current.callee.type === "Identifier" &&
    current.callee.name === "require"
  );
}

function isExportStatement(statement) {
  switch (statement.type) {
    case "ExportNamedDeclaration":
      // `export {}` only marks the file as a module: it exports nothing.
      return (
        Boolean(statement.declaration || statement.source) ||
        statement.specifiers.length > 0
      );
    case "ExportDefaultDeclaration":
    case "ExportAllDeclaration":
    case "TSExportAssignment":
      return true;
    case "ExpressionStatement":
      return exportAssignmentOf(statement) !== null;
    default:
      return false;
  }
}

function exportAssignmentOf(statement) {
  const { expression } = statement;
  if (expression.type !== "AssignmentExpression") return null;
  for (let target = expression.left; target.type === "MemberExpression";) {
    const { object, property } = target;
    if (object.type === "Identifier" && object.name === "exports")
      return expression.right;
    if (
      object.type === "Identifier" &&
      object.name === "module" &&
      !target.computed &&
      property.name === "exports"
    )
      return expression.right;
    target = object;
  }
  return null;
}

function namesExportedByListsAndAssignments(statements) {
  const names = new Set();
  const addIdentifier = (node) => {
    if (node && node.type === "Identifier") names.add(node.name);
  };
  for (const statement of statements) {
    if (
      statement.type === "ExportNamedDeclaration" &&
      !statement.declaration &&
      !statement.source
    )
      statement.specifiers.forEach((specifier) =>
        addIdentifier(specifier.local),
      );
    else if (statement.type === "ExportDefaultDeclaration")
      addIdentifier(statement.declaration);
    else if (statement.type === "TSExportAssignment")
      addIdentifier(statement.expression);
    else if (statement.type === "ExpressionStatement") {
      const exported = exportAssignmentOf(statement);
      if (exported && exported.type === "ObjectExpression")
        exported.properties.forEach((property) =>
          addIdentifier(property.value),
        );
      else addIdentifier(exported);
    }
  }
  return names;
}

function namesDeclaredBy(statement) {
  if (statement.type !== "VariableDeclaration")
    return statement.id ? [statement.id.name] : [];
  const names = [];
  const collect = (pattern) => {
    if (!pattern) return;
    if (pattern.type === "Identifier") names.push(pattern.name);
    else if (pattern.type === "ObjectPattern")
      pattern.properties.forEach((property) =>
        collect(property.type === "RestElement" ? property : property.value),
      );
    else if (pattern.type === "ArrayPattern") pattern.elements.forEach(collect);
    else if (pattern.type === "RestElement") collect(pattern.argument);
    else if (pattern.type === "AssignmentPattern") collect(pattern.left);
  };
  statement.declarations.forEach((declarator) => collect(declarator.id));
  return names;
}

function nameOf(statement) {
  return namesDeclaredBy(statement).join(", ") || "this declaration";
}

function namesBoundToRuleTesters(statements) {
  const names = new Set();
  for (const statement of statements)
    if (statement.type === "VariableDeclaration")
      for (const { id, init } of statement.declarations)
        if (id.type === "Identifier" && isNewRuleTester(init))
          names.add(id.name);
  return names;
}

function isNewRuleTester(node) {
  if (!node || node.type !== "NewExpression") return false;
  const { callee } = node;
  return (
    (callee.type === "Identifier" && callee.name === "RuleTester") ||
    (callee.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.name === "RuleTester")
  );
}

function containsTest(statement, ruleTesters) {
  if (statement.type === "ExpressionStatement")
    return isTestCall(statement.expression, ruleTesters);
  if (LOOPS.has(statement.type))
    return containsTest(statement.body, ruleTesters);
  if (statement.type === "BlockStatement")
    return statement.body.some((inner) => containsTest(inner, ruleTesters));
  if (statement.type === "IfStatement")
    return [statement.consequent, statement.alternate].some(
      (branch) => branch && containsTest(branch, ruleTesters),
    );
  return false;
}

function isTestCall(expression, ruleTesters) {
  const call =
    expression.type === "AwaitExpression" ? expression.argument : expression;
  if (call.type !== "CallExpression") return false;
  const { callee } = call;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.name === "run" &&
    ((callee.object.type === "Identifier" &&
      ruleTesters.has(callee.object.name)) ||
      isNewRuleTester(callee.object))
  )
    return true;
  let root = callee;
  for (;;) {
    if (root.type === "CallExpression") root = root.callee;
    else if (
      root.type === "MemberExpression" &&
      !root.computed &&
      TEST_MODIFIERS.has(root.property.name)
    )
      root = root.object;
    else break;
  }
  return root.type === "Identifier" && TEST_ROOTS.has(root.name);
}
