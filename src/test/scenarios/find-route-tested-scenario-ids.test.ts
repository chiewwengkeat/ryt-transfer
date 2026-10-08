import { findRouteTestedScenarioIds } from "./find-route-tested-scenario-ids";

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>("node:fs");

const ROUTE_TEST_FILE = "src/screens/probe/ProbeScreen.test.tsx";
const ROUTE_TEST = `
it(
  "says the app is offline",
  scenarioTest("transfer.offline", async () => {
    await renderRoute("/");
    expect(await screen.findByText("Offline")).toBeOnTheScreen();
  }),
);
`;

it("credits a scenario from a route test that runs and asserts", () => {
  expect(findRouteTestedScenarioIds(ROUTE_TEST_FILE, ROUTE_TEST)).toEqual([
    "transfer.offline",
  ]);
});

it("credits a route test inside a describe block that runs", () => {
  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      `describe("offline", () => {${ROUTE_TEST}});`,
    ),
  ).toEqual(["transfer.offline"]);
});

it("credits nothing from the harness's own self-test, which renders no route", () => {
  const selfTest = readFileSync(
    `${__dirname}/../scenario-test.test.ts`,
    "utf8",
  );

  expect(
    findRouteTestedScenarioIds("src/test/scenario-test.test.ts", selfTest),
  ).toEqual([]);
  expect(
    findRouteTestedScenarioIds(
      "src/test/scenario-test.test.ts",
      `${selfTest}\nrenderRoute("/");\n`,
    ),
  ).toEqual(["transfer.offline"]);
});

it.each([
  ["it.skip", ROUTE_TEST.replace("it(", "it.skip(")],
  ["xit", ROUTE_TEST.replace("it(", "xit(")],
  ["describe.skip", `describe.skip("offline", () => {${ROUTE_TEST}});`],
  ["xdescribe", `xdescribe("offline", () => {${ROUTE_TEST}});`],
])("credits nothing from a test skipped with %s", (_, skippedTest) => {
  expect(findRouteTestedScenarioIds(ROUTE_TEST_FILE, skippedTest)).toEqual([]);
});

it("credits nothing from a route test that asserts nothing", () => {
  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      ROUTE_TEST.replace(/^\s*expect\(.*$/m, ""),
    ),
  ).toEqual([]);
});

it("credits nothing from an id named only in a comment or a string", () => {
  const named = `it("x", scenarioTest("transfer.offline", async () => { await renderRoute("/"); expect(1).toBe(1); }));`;

  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      `renderRoute("/");\n// ${named}\nconst quoted = '${named}';\n`,
    ),
  ).toEqual([]);
});

it("credits nothing outside a test file", () => {
  expect(
    findRouteTestedScenarioIds(
      "src/screens/probe/walk-to-review.ts",
      ROUTE_TEST,
    ),
  ).toEqual([]);
});
