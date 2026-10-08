import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isStringLiteralLike,
  ScriptTarget,
  type CallExpression,
  type Node,
} from "typescript";

const { isTestFile } = jest.requireActual<{
  isTestFile: (file: string) => boolean;
}>("../../../test-files");

const SKIPPED_DESCRIBE_CALLEES = new Set(["describe.skip", "xdescribe"]);

// ⛔ Strict on purpose: a self-test with no route, a skipped test or one that asserts nothing would pass as coverage.
export function findRouteTestedScenarioIds(file: string, sourceText: string) {
  if (!isTestFile(file)) return [];
  const runningCallsIn = (node: Node): CallExpression[] => {
    if (
      isCallExpression(node) &&
      SKIPPED_DESCRIBE_CALLEES.has(node.expression.getText())
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
  if (!fileCalls.some((call) => call.expression.getText() === "renderRoute"))
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
