import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { formatMalaysianDayHeader } from "@/shared/lib/dates/dates";
import { formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import { standardEasing } from "@/shared/lib/motion/motion";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace/render-trace";
import { usePhoneReducesMotion } from "@/shared/platform/reduce-motion/reduce-motion";
import { colors, minTouchTarget, spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

import ViewAmountWrap from "@/screens/transfer/TransferHistoryScreen/components/SectionTransferAccordion/components/ViewAmountWrap/ViewAmountWrap";

interface Props {
  summary: ListTransfersResponse["days"][number];
  expanded: boolean;
  today: Date;
  onToggle: () => void;
}
export default function HeaderTransferDay({
  summary,
  expanded,
  today,
  onToggle,
}: Props) {
  useRenderTrace("header", summary.date);
  const { t, i18n } = useTranslation(["transfer", "shared"]);
  const dayLabel = traceFormatCalls(formatMalaysianDayHeader)(
    summary.date,
    today,
    t,
  );
  const parsedNet = parseWireAmount(summary.net);
  const netText =
    parsedNet &&
    traceFormatCalls(formatMoney)(parsedNet, { signDisplay: "exceptZero" });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={
        netText === null
          ? t("header_transfer_day.label_without_net", {
              day: dayLabel,
              count: summary.count,
            })
          : t("header_transfer_day.label", {
              day: dayLabel,
              count: summary.count,
              net: netText,
            })
      }
      accessibilityLanguage={i18n.language}
      onPress={onToggle}
      style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
    >
      <IconChevron expanded={expanded} />
      <ViewAmountWrap
        columnGap={spacing.sm}
        amount={
          netText === null ? null : (
            <TextBody strong tone="secondary">
              {netText}
            </TextBody>
          )
        }
      >
        <TextBody strong tone="secondary">
          {t("header_transfer_day.title", {
            day: dayLabel,
            count: summary.count,
          })}
        </TextBody>
      </ViewAmountWrap>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  headerPressed: { opacity: 0.8 },
});

interface IconChevronProps {
  expanded: boolean;
}
function IconChevron({ expanded }: IconChevronProps) {
  const phoneReducesMotion = usePhoneReducesMotion();
  const turnStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(expanded ? "45deg" : "-45deg", {
          duration: 200,
          easing: standardEasing,
          reduceMotion: phoneReducesMotion
            ? ReduceMotion.Always
            : ReduceMotion.Never,
        }),
      },
    ],
  }));

  return (
    <Animated.View aria-hidden style={[iconChevronStyles.chevron, turnStyle]} />
  );
}

const iconChevronStyles = StyleSheet.create({
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textSecondary,
  },
});
