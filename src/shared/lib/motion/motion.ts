import { AccessibilityInfo } from "react-native";

export const motionDurations = { screenTransition: 220 };

let phoneReducesMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((reduces) => {
  phoneReducesMotion = reduces;
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (reduces) => {
  phoneReducesMotion = reduces;
});

export function screenTransitionOptions() {
  return {
    animation: phoneReducesMotion ? "fade" : "default",
    // Only iOS's fade honours it; pushes and Android keep the platform's timing.
    animationDuration: motionDurations.screenTransition,
    // The result page replaces the whole flow, which the native default would play as a step back.
    animationTypeForReplace: "push",
  } as const;
}
