import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isElementAccessExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isStringLiteralLike,
  ScriptTarget,
  type CallExpression,
  type Expression,
  type Node,
} from "typescript";

// Not an import: the import rules refuse any repo file outside src/.
const { isTestFile } = jest.requireActual<{
  isTestFile: (file: string) => boolean;
}>("../../../.config/test-files");

const JEST_GLOBAL_MODIFIERS = new Map<string, string[]>([
  ["describe", []],
  ["it", []],
  ["test", []],
  ["xdescribe", ["skip"]],
  ["xit", ["skip"]],
  ["xtest", ["skip"]],
  ["fdescribe", ["only"]],
  ["fit", ["only"]],
]);

// ⛔ Strict on purpose: a self-test with no route, a skipped test or one that asserts nothing would pass as coverage.
export function findRouteTestedScenarioIds(file: string, sourceText: string) {
  if (!isTestFile(file)) return [];
  const runningCallsIn = (node: Node): CallExpression[] => {
    if (
      isCallExpression(node) &&
      readJestModifiers(node.expression)?.includes("skip")
    )
      return [];
    const calls = isCallExpression(node) ? [node] : [];
    forEachChild(node, (child) => {
      calls.push(...runningCallsIn(child));
    });
    return calls;
  };
  const fileCalls = runningCallsIn(
    createSourceFile(file, sourceText, ScriptTarget.Latest, true),
  );
  // One focused test makes Jest skip the file's others; lint bans focus, so the file credits nothing.
  if (
    fileCalls.some((call) =>
      readJestModifiers(call.expression)?.includes("only"),
    ) ||
    !fileCalls.some((call) => call.expression.getText() === "renderRoute")
  )
    return [];
  return fileCalls
    .filter((call) => call.expression.getText() === "it")
    .flatMap((testCall) => {
      const callsInTest = runningCallsIn(testCall);
      if (!callsInTest.some((call) => call.expression.getText() === "expect"))
        return [];
      return callsInTest.flatMap((call) => {
        const [scenarioId] = call.arguments;
        return call.expression.getText() === "scenarioTest" &&
          scenarioId !== undefined &&
          isStringLiteralLike(scenarioId)
          ? [scenarioId.text]
          : [];
      });
    });
}

// describe.skip.each(table)(…) and xdescribe.each(table)(…) both read skip, each.
function readJestModifiers(callee: Expression): string[] | undefined {
  if (isCallExpression(callee)) return readJestModifiers(callee.expression);
  if (isIdentifier(callee)) return JEST_GLOBAL_MODIFIERS.get(callee.text);
  if (isPropertyAccessExpression(callee))
    return readJestModifiers(callee.expression)?.concat(callee.name.text);
  if (
    isElementAccessExpression(callee) &&
    isStringLiteralLike(callee.argumentExpression)
  )
    return readJestModifiers(callee.expression)?.concat(
      callee.argumentExpression.text,
    );
  return undefined;
}
