import { AccessibilityInfo } from "react-native";
import { Easing } from "react-native-reanimated";
import { createStore } from "zustand/vanilla";

export const motionDurations = {
  screenTransition: 220,
  screenContentEntrance: 250,
  successMark: 400,
};

// Material Design 3's standard easing.
export const standardEasing = Easing.bezier(0.2, 0, 0, 1);

// A store, so screens re-render when the setting changes mid-session: Reanimated's own default reads it once, at launch.
export const reduceMotionStore = createStore(() => ({
  phoneReducesMotion: false,
}));
void AccessibilityInfo.isReduceMotionEnabled().then((reduces) => {
  reduceMotionStore.setState({ phoneReducesMotion: reduces });
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (reduces) => {
  reduceMotionStore.setState({ phoneReducesMotion: reduces });
});

export function screenTransitionOptions() {
  return {
    animation: reduceMotionStore.getState().phoneReducesMotion
      ? "fade"
      : "default",
    // Only iOS's fade honours it; pushes and Android keep the platform's timing.
    animationDuration: motionDurations.screenTransition,
    // The result page replaces the whole flow, which the native default would play as a step back.
    animationTypeForReplace: "push",
  } as const;
}
