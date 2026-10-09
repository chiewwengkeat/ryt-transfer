import { act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import * as Reanimated from "react-native-reanimated";

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
