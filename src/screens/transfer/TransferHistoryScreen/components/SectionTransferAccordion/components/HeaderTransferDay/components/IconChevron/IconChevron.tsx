import { StyleSheet } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { motionDurations, standardEasing } from "@/shared/lib/motion/motion";
import { usePhoneReducesMotion } from "@/shared/platform/reduce-motion";
import { colors } from "@/shared/theme/theme";

interface Props {
  expanded: boolean;
}
export default function IconChevron({ expanded }: Props) {
  const phoneReducesMotion = usePhoneReducesMotion();
  const turnStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(expanded ? "45deg" : "-45deg", {
          duration: motionDurations.chevronTurn,
          easing: standardEasing,
          reduceMotion: phoneReducesMotion
            ? ReduceMotion.Always
            : ReduceMotion.Never,
        }),
      },
    ],
  }));

  return <Animated.View aria-hidden style={[styles.chevron, turnStyle]} />;
}

const styles = StyleSheet.create({
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textSecondary,
  },
});
