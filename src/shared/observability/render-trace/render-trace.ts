import { useEffect, useRef } from "react";
import { Linking } from "react-native";

// ⛔ Keep the literal comparison in each export, never a shared constant or config: Metro folds only this form, which removes the active functions below from demo and production builds.
export const useRenderTrace =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? useCellCommitRecording
    : () => {};
export const traceFormatCalls =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? wrapFormatterCountingCalls
    : <Args extends unknown[], Result>(format: (...args: Args) => Result) =>
        format;
export const useRenderMeasurement =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? useRenderMeasurementFromLaunchLink
    : () => {};

let cellCommitCount = 0;
let formatCallCount = 0;
// The launch link outlives every remount, which would otherwise measure again.
let hasMeasuredThisLaunch = false;
const shownCells = new Map<object, { cellKind: string; cellKey: string }>();
let measuredCommits:
  { cellKind: string; cellKey: string; rerender: boolean }[] | null = null;

function useCellCommitRecording(cellKind: string, cellKey: string) {
  const committedKeyRef = useRef<string>(undefined);
  useEffect(() => {
    cellCommitCount += 1;
    // A recycled cell showing a new key is that key's first render, not a re-render.
    measuredCommits?.push({
      cellKind,
      cellKey,
      rerender: committedKeyRef.current === cellKey,
    });
    committedKeyRef.current = cellKey;
    shownCells.set(committedKeyRef, { cellKind, cellKey });
  });
  useEffect(
    () => () => {
      shownCells.delete(committedKeyRef);
    },
    [],
  );
}

function wrapFormatterCountingCalls<Args extends unknown[], Result>(
  format: (...args: Args) => Result,
) {
  return (...args: Args) => {
    formatCallCount += 1;
    return format(...args);
  };
}

function useRenderMeasurementFromLaunchLink(
  operations: Record<string, () => unknown>,
  describeState: () => Record<string, unknown>,
) {
  const latestInputsRef = useRef({ operations, describeState });
  useEffect(() => {
    latestInputsRef.current = { operations, describeState };
  });
  useEffect(() => {
    let isUnmounted = false;
    void Linking.getInitialURL().then(async (launchURL) => {
      if (
        hasMeasuredThisLaunch ||
        !/[?&]measure=renders(&|$)/.test(launchURL ?? "")
      )
        return;
      hasMeasuredThisLaunch = true;
      for (const operation of Object.keys(latestInputsRef.current.operations)) {
        await waitUntilCommitsSettle();
        if (isUnmounted) return;
        const before = latestInputsRef.current.describeState();
        const countsByCellKind: Record<
          string,
          {
            mounted: number;
            rerenderedCells: number;
            rerenders: number;
            firstRenders: number;
          }
        > = {};
        const countsFor = (cellKind: string) =>
          (countsByCellKind[cellKind] ??= {
            mounted: 0,
            rerenderedCells: 0,
            rerenders: 0,
            firstRenders: 0,
          });
        const shownAtStart = new Set<string>();
        for (const { cellKind, cellKey } of shownCells.values()) {
          shownAtStart.add(`${cellKind}\n${cellKey}`);
          countsFor(cellKind).mounted += 1;
        }
        const formatCallsAtStart = formatCallCount;
        measuredCommits = [];
        await latestInputsRef.current.operations[operation]?.();
        await waitUntilCommitsSettle();
        const commits = measuredCommits;
        measuredCommits = null;
        if (isUnmounted) return;

        const rerenderedKindsAndKeys = new Set<string>();
        for (const { cellKind, cellKey, rerender } of commits) {
          const kindAndKey = `${cellKind}\n${cellKey}`;
          if (!rerender) countsFor(cellKind).firstRenders += 1;
          else if (shownAtStart.has(kindAndKey)) {
            countsFor(cellKind).rerenders += 1;
            if (!rerenderedKindsAndKeys.has(kindAndKey))
              countsFor(cellKind).rerenderedCells += 1;
            rerenderedKindsAndKeys.add(kindAndKey);
          }
        }
        console.info(
          `ryt-render-trace ${JSON.stringify({
            operation,
            before,
            after: latestInputsRef.current.describeState(),
            cells: countsByCellKind,
            formatCalls: formatCallCount - formatCallsAtStart,
          })}`,
        );
      }
    });
    return () => {
      isUnmounted = true;
    };
  }, []);
}

async function waitUntilCommitsSettle() {
  for (let snapshot = ""; ;) {
    const nextSnapshot = `${cellCommitCount}/${formatCallCount}`;
    if (nextSnapshot === snapshot) return;
    snapshot = nextSnapshot;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
