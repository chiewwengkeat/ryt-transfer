import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import ViewAmountWrap from "@/screens/transfer/TransferHistoryScreen/components/ViewTransferHistory/components/SectionTransferAccordion/components/ViewAmountWrap/ViewAmountWrap";
import { formatMalaysianDayHeader } from "@/shared/lib/dates/dates";
import { formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace/render-trace";
import { colors, minTouchTarget, spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";
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
  const { t, i18n } = useTranslation(["transfer", "shared"]);
  useRenderTrace("header", summary.date);

  const labelDay = traceFormatCalls(formatMalaysianDayHeader)(
    summary.date,
    today,
    t,
  );
  const parsedNet = parseWireAmount(summary.net);
  const textNet =
    parsedNet &&
    traceFormatCalls(formatMoney)(parsedNet, { signDisplay: "exceptZero" });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={
        textNet === null
          ? t("header_transfer_day.label_without_net", {
              day: labelDay,
              count: summary.count,
            })
          : t("header_transfer_day.label", {
              day: labelDay,
              count: summary.count,
              net: textNet,
            })
      }
      accessibilityLanguage={i18n.language}
      onPress={onToggle}
      style={({ pressed }) => [styles.main, pressed && styles.pressed]}
    >
      <IconChevron expanded={expanded} />
      <ViewAmountWrap
        columnGap={spacing.sm}
        amount={
          textNet === null ? null : (
            <TextBody strong tone="secondary">
              {textNet}
            </TextBody>
          )
        }
      >
        <TextBody strong tone="secondary">
          {t("header_transfer_day.title", {
            day: labelDay,
            count: summary.count,
          })}
        </TextBody>
      </ViewAmountWrap>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  main: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.8 },
});
