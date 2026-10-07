import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { formatMalaysianDayHeader } from "@/shared/lib/dates/dates";
import { formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import { colors, minTouchTarget, spacing } from "@/shared/theme/theme";
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
  const { t } = useTranslation("transfer");
  const day = formatMalaysianDayHeader(summary.date, today);
  const net = parseWireAmount(summary.net);
  const netText = net && formatMoney(net, { signDisplay: "exceptZero" });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={
        netText === null
          ? t("history.day.label_without_net", { day, count: summary.count })
          : t("history.day.label", { day, count: summary.count, net: netText })
      }
      onPress={onToggle}
      style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
    >
      <IconChevron expanded={expanded} />
      <View style={styles.title}>
        <TextBody strong>
          {t("history.day.title", { day, count: summary.count })}
        </TextBody>
      </View>
      {netText !== null && <TextBody strong>{netText}</TextBody>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  headerPressed: { opacity: 0.8 },
  title: { flex: 1 },
});
