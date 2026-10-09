import { findRouteTestedScenarioIds } from "./find-route-tested-scenario-ids";

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
    `${__dirname}/../render/drive-app.test.ts`,
    "utf8",
  );

  expect(
    findRouteTestedScenarioIds("src/test/render/drive-app.test.ts", selfTest),
  ).toEqual([]);
  expect(
    findRouteTestedScenarioIds(
      "src/test/render/drive-app.test.ts",
      `${selfTest}\nrenderRoute("/");\n`,
    ),
  ).toEqual(["transfer.offline"]);
});

it.each([
  ["it.skip", ROUTE_TEST.replace("it(", "it.skip(")],
  ["xit", ROUTE_TEST.replace("it(", "xit(")],
  ["describe.skip", `describe.skip("offline", () => {${ROUTE_TEST}});`],
  ["xdescribe", `xdescribe("offline", () => {${ROUTE_TEST}});`],
  [
    "describe.skip.each",
    `describe.skip.each([[1]])("offline %s", () => {${ROUTE_TEST}});`,
  ],
  [
    "xdescribe.each",
    `xdescribe.each([[1]])("offline %s", () => {${ROUTE_TEST}});`,
  ],
  ['describe["skip"]', `describe["skip"]("offline", () => {${ROUTE_TEST}});`],
])("credits nothing from a test skipped with %s", (_, skippedTest) => {
  expect(findRouteTestedScenarioIds(ROUTE_TEST_FILE, skippedTest)).toEqual([]);
});

it.each(["it.only", "test.only", "fit", "describe.only"])(
  "credits nothing beside a test focused with %s",
  (focus) => {
    expect(
      findRouteTestedScenarioIds(
        ROUTE_TEST_FILE,
        `${ROUTE_TEST}\n${focus}("focused", () => {});`,
      ),
    ).toEqual([]);
  },
);

it("credits a route test beside a focused test that a skipped block holds", () => {
  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      `${ROUTE_TEST}\ndescribe.skip("parked", () => { it.only("focused", () => {}); });`,
    ),
  ).toEqual(["transfer.offline"]);
});

it("credits a route test that calls another object's only method", () => {
  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      ROUTE_TEST.replace(
        'await renderRoute("/");',
        'await renderRoute("/");\n    rows.only();',
      ),
    ),
  ).toEqual(["transfer.offline"]);
});

it.each([
  ["test", ROUTE_TEST.replace("it(", "test(")],
  [
    "it.each",
    `it.each([["Offline"]])("says %s", (text) => scenarioTest("transfer.offline", async () => { await renderRoute("/"); expect(await screen.findByText(text)).toBeOnTheScreen(); })());`,
  ],
])("credits nothing from a test written with %s", (_, test) => {
  expect(findRouteTestedScenarioIds(ROUTE_TEST_FILE, test)).toEqual([]);
});

it.each([
  [
    "describe.skip",
    `describe.skip("parked", () => { it("renders", async () => { await renderRoute("/"); }); });`,
  ],
  ["it.skip", `it.skip("renders", async () => { await renderRoute("/"); });`],
])(
  "credits nothing from a file that renders a route only under %s",
  (_, parkedRender) => {
    expect(
      findRouteTestedScenarioIds(
        ROUTE_TEST_FILE,
        `${ROUTE_TEST.replace('await renderRoute("/");', "")}\n${parkedRender}`,
      ),
    ).toEqual([]);
  },
);

it("credits nothing from a route test that asserts nothing, beside one that does", () => {
  expect(
    findRouteTestedScenarioIds(
      ROUTE_TEST_FILE,
      `${ROUTE_TEST.replace(/^\s*expect\(.*$/m, "")}\nit("asserts", () => { expect(1).toBe(1); });`,
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

// Jest defines it; the app's types deliberately leave out Node's globals.
declare const __dirname: string;

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>("node:fs");

const ROUTE_TEST_FILE = "src/screens/probe/ProbeScreen.test.tsx";
