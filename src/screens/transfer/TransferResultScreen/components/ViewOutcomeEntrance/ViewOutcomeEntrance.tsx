import { type ReactNode, useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import { motionDurations, standardEasing } from "@/shared/lib/motion/motion";
import { phoneReducesMotionNow } from "@/shared/platform/reduce-motion/reduce-motion";
import { spacing } from "@/shared/theme/theme";

interface Props {
  outcome: TransferOutcomeScenario;
  children: ReactNode;
}
export default function ViewOutcomeEntrance({ outcome, children }: Props) {
  const entranceProgress = useSharedValue(phoneReducesMotionNow() ? 1 : 0);
  // Replayed in place, never by remounting: a remount resets the outcome's screen-reader focus and announcement.
  useEffect(() => {
    if (phoneReducesMotionNow()) {
      entranceProgress.set(1);
      return;
    }
    entranceProgress.set(0);
    entranceProgress.set(
      withTiming(1, {
        duration: motionDurations.screenContentEntrance,
        easing: standardEasing,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [outcome, entranceProgress]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceProgress.get(),
    transform: [{ scale: 0.96 + 0.04 * entranceProgress.get() }],
  }));

  return (
    <Animated.View style={[styles.outcome, entranceStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outcome: { gap: spacing.md },
});
