import { standardEasing } from "@/shared/lib/motion/motion";
import { usePhoneReducesMotion } from "@/shared/platform/reduce-motion/reduce-motion";
import { colors } from "@/shared/theme/theme";
import { StyleSheet } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

interface Props {
  expanded: boolean;
}
export default function IconChevron({ expanded }: Props) {
  const doesPhoneReduceMotion = usePhoneReducesMotion();
  const turnStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(expanded ? "45deg" : "-45deg", {
          duration: 200,
          easing: standardEasing,
          reduceMotion: doesPhoneReduceMotion
            ? ReduceMotion.Always
            : ReduceMotion.Never,
        }),
      },
    ],
  }));

  return <Animated.View aria-hidden style={[styles.main, turnStyle]} />;
}

const styles = StyleSheet.create({
  main: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textSecondary,
  },
});
