import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { formatMalaysianDayHeader } from "@/shared/lib/dates/dates";
import { formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

import IconChevron from "./components/IconChevron/IconChevron";

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
  const { t, i18n } = useTranslation("transfer");
  const { fontScale } = useWindowDimensions();
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
          ? t("history.day.label_without_net", {
              day: dayLabel,
              count: summary.count,
            })
          : t("history.day.label", {
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
      <View style={styles.titleAndNet}>
        <View
          style={[
            styles.title,
            // Seven ems hold a long word such as "Yesterday": a net that would leave less wraps to its own line.
            { flexBasis: 7 * typography.body.fontSize * fontScale },
          ]}
        >
          <TextBody strong tone="secondary">
            {t("history.day.title", { day: dayLabel, count: summary.count })}
          </TextBody>
        </View>
        {netText !== null && (
          <TextBody strong tone={"secondary"}>
            {netText}
          </TextBody>
        )}
      </View>
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
  titleAndNet: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    // Moves only a wrapped net: to the header's end, where the amounts below it end.
    justifyContent: "flex-end",
    alignItems: "center",
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  title: { flexGrow: 1, flexShrink: 1 },
});
