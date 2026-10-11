import { act, render } from "@testing-library/react-native";
import * as React from "react";
import { useState } from "react";
import * as ReactNative from "react-native";
import { Linking, Text } from "react-native";
import type * as RenderTrace from "./render-trace";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (VARIANT_BEFORE_TESTS === undefined)
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = VARIANT_BEFORE_TESTS;
});

it("counts a re-render only for a cell redrawing the key it showed at the start, and a cell showing a new key as a first render", async () => {
  loadRenderTraceBuiltAs("development");
  const { measurements } = await launchWith(MEASURE_LINK);

  await passTime(20_000);

  expect(measurements()).toEqual([
    {
      operation: "rerenderEveryCellTwice",
      before: { rowCount: 2 },
      after: { rowCount: 2 },
      cells: {
        header: {
          mounted: 1,
          rerenderedCells: 1,
          rerenders: 2,
          firstRenders: 0,
        },
        row: { mounted: 2, rerenderedCells: 2, rerenders: 4, firstRenders: 0 },
      },
      formatCalls: 6,
    },
    {
      operation: "showNewKeyInFirstRow",
      before: { rowCount: 2 },
      after: { rowCount: 2 },
      cells: {
        header: {
          mounted: 1,
          rerenderedCells: 1,
          rerenders: 1,
          firstRenders: 0,
        },
        row: { mounted: 2, rerenderedCells: 1, rerenders: 1, firstRenders: 1 },
      },
      formatCalls: 3,
    },
    {
      operation: "unmountLastRow",
      before: { rowCount: 2 },
      after: { rowCount: 1 },
      cells: {
        header: {
          mounted: 1,
          rerenderedCells: 1,
          rerenders: 1,
          firstRenders: 0,
        },
        row: { mounted: 2, rerenderedCells: 1, rerenders: 1, firstRenders: 0 },
      },
      formatCalls: 2,
    },
    {
      operation: "showNewKeyThenRedrawIt",
      before: { rowCount: 1 },
      after: { rowCount: 1 },
      cells: {
        header: {
          mounted: 1,
          rerenderedCells: 1,
          rerenders: 2,
          firstRenders: 0,
        },
        row: { mounted: 1, rerenderedCells: 0, rerenders: 0, firstRenders: 1 },
      },
      formatCalls: 4,
    },
    {
      operation: "shiftEveryRowDownOneSlot",
      before: { rowCount: 1 },
      after: { rowCount: 2 },
      cells: {
        header: {
          mounted: 1,
          rerenderedCells: 1,
          rerenders: 1,
          firstRenders: 0,
        },
        row: { mounted: 1, rerenderedCells: 0, rerenders: 0, firstRenders: 2 },
      },
      formatCalls: 3,
    },
  ]);
});

it("measures nothing unless the measure link opened the app", async () => {
  loadRenderTraceBuiltAs("development");
  const { measurements } = await launchWith("ryt-dev://transfer-history");

  await passTime(20_000);

  expect(measurements()).toEqual([]);
});

it("measures once per launch, however often its screen mounts", async () => {
  loadRenderTraceBuiltAs("development");
  const { view, measurements } = await launchWith(MEASURE_LINK);
  await passTime(20_000);
  expect(measurements()).toHaveLength(5);

  await view.unmount();
  await render(<TracedCells />);
  await passTime(20_000);

  expect(measurements()).toHaveLength(5);
});

it.each([
  ["production", "production"],
  ["demo", "demo"],
  ["unset", undefined],
  ["empty", ""],
])(
  "never reads the launch link or measures in a build whose variant is %s",
  async (_label, variant) => {
    loadRenderTraceBuiltAs(variant);
    const { getInitialURL, measurements } = await launchWith(MEASURE_LINK);

    await passTime(20_000);

    expect(getInitialURL).not.toHaveBeenCalled();
    expect(measurements()).toEqual([]);
  },
);

const VARIANT_BEFORE_TESTS = process.env.EXPO_PUBLIC_APP_VARIANT;
const MEASURE_LINK = "ryt-dev://transfer-history?measure=renders";
let renderTrace: typeof RenderTrace;

function loadRenderTraceBuiltAs(variant: string | undefined) {
  if (variant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  jest.isolateModules(() => {
    // The cells below render with this file's React, and the spy below watches this file's Linking.
    jest.doMock("react", () => React);
    jest.doMock("react-native", () => ReactNative);
    renderTrace = jest.requireActual<typeof RenderTrace>("./render-trace");
  });
}

function TracedCell({
  cellKind,
  cellKey,
}: {
  cellKind: string;
  cellKey: string;
}) {
  renderTrace.useRenderTrace(cellKind, cellKey);
  return (
    <Text>
      {renderTrace.traceFormatCalls((text: string) => text.toUpperCase())(
        cellKey,
      )}
    </Text>
  );
}

// Keyed by slot, never by row: a recycling list hands a mounted cell another row.
function TracedCells() {
  const [rows, setRows] = useState([
    { slot: "first", rowKey: "a" },
    { slot: "second", rowKey: "b" },
  ]);
  renderTrace.useRenderMeasurement(
    {
      rerenderEveryCellTwice: () => {
        setRows((current) => [...current]);
        setTimeout(() => {
          setRows((current) => [...current]);
        }, 100);
      },
      showNewKeyInFirstRow: () => {
        setRows([
          { slot: "first", rowKey: "c" },
          { slot: "second", rowKey: "b" },
        ]);
      },
      unmountLastRow: () => {
        setRows([{ slot: "first", rowKey: "c" }]);
      },
      showNewKeyThenRedrawIt: () => {
        setRows([{ slot: "first", rowKey: "d" }]);
        setTimeout(() => {
          setRows((current) => [...current]);
        }, 100);
      },
      shiftEveryRowDownOneSlot: () => {
        setRows([
          { slot: "first", rowKey: "e" },
          { slot: "second", rowKey: "d" },
        ]);
      },
    },
    () => ({ rowCount: rows.length }),
  );
  return (
    <>
      <TracedCell cellKind="header" cellKey="day" />
      {rows.map(({ slot, rowKey }) => (
        <TracedCell key={slot} cellKind="row" cellKey={rowKey} />
      ))}
    </>
  );
}

async function launchWith(launchURL: string | null) {
  // jest-expo's Linking is already a mock, so spyOn hands back that one, calls from earlier tests included.
  const getInitialURL = jest
    .spyOn(Linking, "getInitialURL")
    .mockClear()
    .mockResolvedValue(launchURL);
  const logged = jest
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  const view = await render(<TracedCells />);
  const measurements = () =>
    logged.mock.calls.flatMap(([line]: unknown[]) =>
      typeof line === "string" && line.startsWith("ryt-render-trace ")
        ? [JSON.parse(line.slice("ryt-render-trace ".length)) as unknown]
        : [],
    );
  return { view, getInitialURL, measurements };
}

// In steps: an act holds its updates until it ends, so one long act would show the trace no commits.
async function passTime(milliseconds: number) {
  for (let passed = 0; passed < milliseconds; passed += 100)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
}
