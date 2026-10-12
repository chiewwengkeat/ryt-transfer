import { AccessibilityInfo } from "react-native";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

// Kept current from launch rather than on first use: the stack's transition options read it outside any component.
// eslint-disable-next-line fe/file-layout -- read at load by isReduceMotionEnabled().then
const reduceMotionStore = createStore(() => ({
  phoneReducesMotion: false,
}));
AccessibilityInfo.isReduceMotionEnabled().then((doesPhoneReduceMotion) => {
  reduceMotionStore.setState({ phoneReducesMotion: doesPhoneReduceMotion });
});
AccessibilityInfo.addEventListener(
  "reduceMotionChanged",
  (doesPhoneReduceMotion) => {
    reduceMotionStore.setState({ phoneReducesMotion: doesPhoneReduceMotion });
  },
);

// Re-renders on a change mid-session: Reanimated's own default reads the setting once, at launch.
export function usePhoneReducesMotion() {
  return useStore(reduceMotionStore, (motion) => motion.phoneReducesMotion);
}

export function phoneReducesMotionNow() {
  return reduceMotionStore.getState().phoneReducesMotion;
}
