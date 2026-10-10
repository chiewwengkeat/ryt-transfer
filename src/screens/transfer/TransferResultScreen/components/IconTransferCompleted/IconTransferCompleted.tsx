import { StyleSheet, View } from "react-native";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";

import { standardEasing } from "@/shared/lib/motion/motion";
import { usePhoneReducesMotion } from "@/shared/platform/reduce-motion/reduce-motion";
import { colors } from "@/shared/theme/theme";

export default function IconTransferCompleted() {
  const phoneReducesMotion = usePhoneReducesMotion();

  return (
    <Animated.View
      aria-hidden
      entering={new Keyframe({
        0: { opacity: 0, transform: [{ scale: 0.8 }] },
        100: { opacity: 1, transform: [{ scale: 1 }], easing: standardEasing },
      })
        .duration(400)
        .reduceMotion(
          phoneReducesMotion ? ReduceMotion.Always : ReduceMotion.Never,
        )}
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
    alignSelf: "center",
  },
  tick: {
    width: 14,
    height: 28,
    borderColor: colors.onAccent,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    // Lifted: once turned, the stroke's weight sits below the box's centre.
    transform: [{ translateY: -4 }, { rotate: "45deg" }],
    alignSelf: "center",
  },
});
