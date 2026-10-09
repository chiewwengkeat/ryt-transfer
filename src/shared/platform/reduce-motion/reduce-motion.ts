import { AccessibilityInfo } from "react-native";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

// Kept current from launch rather than on first use: the stack's transition options read it outside any component.
const reduceMotionStore = createStore(() => ({
  phoneReducesMotion: false,
}));
void AccessibilityInfo.isReduceMotionEnabled().then((reduces) => {
  reduceMotionStore.setState({ phoneReducesMotion: reduces });
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (reduces) => {
  reduceMotionStore.setState({ phoneReducesMotion: reduces });
});

// Re-renders on a change mid-session: Reanimated's own default reads the setting once, at launch.
export function usePhoneReducesMotion() {
  return useStore(reduceMotionStore, (motion) => motion.phoneReducesMotion);
}

export function phoneReducesMotionNow() {
  return reduceMotionStore.getState().phoneReducesMotion;
}
