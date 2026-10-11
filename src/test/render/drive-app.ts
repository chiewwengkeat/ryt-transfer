import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { pickTransferScenario } from "@/mocks/bank/bank";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import {
  AccessibilityInfo,
  AppState,
  DeviceEventEmitter,
  type AppStateStatus,
  type NativeEventSubscription,
} from "react-native";
import * as Reanimated from "react-native-reanimated";

// Callers pass the id as a literal: the matrix check finds each scenario's tests by reading it.
export function scenarioTest(
  scenarioId: `${TransferScenarioId}`,
  run: () => Promise<void>,
) {
  return async () => {
    pickTransferScenario(scenarioId);
    await run();
  };
}

export async function enterTransferRecipientAndAmount() {
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
}

export async function walkToTransferReview({ note }: { note?: string } = {}) {
  await enterTransferRecipientAndAmount();
  if (note !== undefined)
    await fireEvent.changeText(screen.getByLabelText("Note (optional)"), note);
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
}

export async function enterPinAndApprove(pin: string) {
  for (const digit of pin)
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
}

export async function approveFromReviewOpenedAgain() {
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");
}

export async function pickDemoScenario(title: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Demo menu" }));
  await fireEvent.press(screen.getByRole("radio", { name: title }));
}

export function pressHandlerOf(element: ReturnType<typeof screen.getByRole>) {
  // A host element carries no onPress: the component that handles the press sits above it.
  for (
    let fiber: PressFiber | null = (
      element as unknown as { unstable_fiber: PressFiber }
    ).unstable_fiber;
    fiber !== null;
    fiber = fiber.return
  ) {
    const onPress = fiber.memoizedProps?.onPress;
    if (typeof onPress === "function") return onPress as () => void;
  }
  throw new Error("Nothing handles a press on this element.");
}

// ⛔ Assert on the group, never the text: each text carries the language itself, so it passes either way.
export function findAccessibleGroupAround(
  text: ReturnType<typeof screen.getByText>,
) {
  let element = text.parent;
  while (element !== null && element.props.accessible !== true)
    element = element.parent;
  return element;
}

// Jest plays no screen transitions. "appear" from any element inside bubbles to its native screen as the phone's signal.
export async function finishOpeningScreen(
  elementOnTheScreen: Parameters<typeof fireEvent>[0],
) {
  await fireEvent(elementOnTheScreen, "appear");
}

export async function pressHardwareBack() {
  await act(() => {
    DeviceEventEmitter.emit("hardwareBackPress");
  });
}

// ⛔ Skip removed listeners: the double's remove() does nothing, so a listener the app has removed would still answer.
export function moveAppTo(state: AppStateStatus) {
  const { calls, results } = jest.mocked(AppState).addEventListener.mock;
  calls.forEach(([eventName, listener], index) => {
    const subscription = results[index]?.value as NativeEventSubscription;
    if (
      eventName === "change" &&
      jest.mocked(subscription).remove.mock.calls.length === 0
    )
      listener(state);
  });
}

export async function turnOnPhoneReduceMotion() {
  const appListeners = jest
    .mocked<{
      addEventListener(
        eventName: string,
        hearReduceMotion: (reduces: boolean) => void,
      ): unknown;
    }>(AccessibilityInfo)
    .addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "reduceMotionChanged",
    );
  if (appListeners.length === 0)
    throw new Error("Nothing in the app listens for reduce motion yet.");
  await act(() => {
    for (const [, hearReduceMotion] of appListeners) hearReduceMotion(true);
  });
}

// Reanimated's Jest mock runs no animation, so the reduce-motion choice each one is handed is all a test can see.
export function watchReduceMotionOfAnimations() {
  const timedAnimations = jest.spyOn(Reanimated, "withTiming");
  const layoutAnimations = jest.spyOn(
    Reanimated.Keyframe.prototype,
    "reduceMotion",
  );
  return () => [
    ...timedAnimations.mock.calls.map(([, config]) => config?.reduceMotion),
    ...layoutAnimations.mock.calls.map(([reduceMotion]) => reduceMotion),
  ];
}

// Longer than a receipt takes to lift the block: a receipt test's waitFor would give up first, after 1 s.
export async function waitPastReceiptSettle() {
  await act(() => {
    jest.advanceTimersByTime(1_000);
  });
}

// The bank answers after msw's delay(), which renderRoute's fake timers hold forever. The test stays on real timers.
export function readBankOnRealTimers<Answer>(readBank: () => Promise<Answer>) {
  jest.useRealTimers();
  return readBank();
}

// For a test that builds its own client: each cache entry's 5-minute gc timer runs on real time and holds Jest open.
export function createQueryClientWithoutGcTimers() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
}

type PressFiber = {
  memoizedProps: { onPress?: unknown } | null;
  return: PressFiber | null;
};
