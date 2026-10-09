import { Easing } from "react-native-reanimated";

import { phoneReducesMotionNow } from "@/shared/platform/reduce-motion/reduce-motion";

export const motionDurations = {
  screenTransition: 220,
  screenContentEntrance: 250,
  successMark: 400,
  chevronTurn: 200,
};

// Material Design 3's standard easing.
export const standardEasing = Easing.bezier(0.2, 0, 0, 1);

export function screenTransitionOptions() {
  return {
    animation: phoneReducesMotionNow() ? "fade" : "default",
    // Only iOS's fade honours it; pushes and Android keep the platform's timing.
    animationDuration: motionDurations.screenTransition,
  } as const;
}
