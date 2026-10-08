import { StyleSheet, View } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";

import { motionDurations, standardEasing } from "@/shared/lib/motion/motion";
import { colors } from "@/shared/theme/theme";

export default function IconTransferCompleted() {
  return (
    <Animated.View
      aria-hidden
      entering={new Keyframe({
        0: { opacity: 0, transform: [{ scale: 0.8 }] },
        100: { opacity: 1, transform: [{ scale: 1 }], easing: standardEasing },
      }).duration(motionDurations.successMark)}
      style={styles.circle}
    >
      <View style={styles.tick} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  tick: {
    width: 14,
    height: 28,
    borderColor: colors.onAccent,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    // Lifted: once turned, the stroke's weight sits below the box's centre.
    transform: [{ translateY: -4 }, { rotate: "45deg" }],
  },
});
