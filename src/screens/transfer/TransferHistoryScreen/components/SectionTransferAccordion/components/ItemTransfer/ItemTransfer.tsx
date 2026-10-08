import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import type { Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word";
import { formatMalaysianTime } from "@/shared/lib/dates/dates";
import { asSen, formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace";
import { colors, minTouchTarget, spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

import IconTransferDirection from "./components/IconTransferDirection/IconTransferDirection";

interface Props {
  transfer: Transfer;
}
export default function ItemTransfer({ transfer }: Props) {
  useRenderTrace("row", transfer.transferId);
  const { t, i18n } = useTranslation("transfer");
  const statusWord = useTransferStatusWord(transfer);
  const parsedAmount = parseWireAmount(transfer.amount);
  const moneyMovedSign = MONEY_MOVED_SIGN[transfer.funds];
  const transferTime = traceFormatCalls(formatMalaysianTime)(
    transfer.createdAt,
    t,
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLanguage={i18n.language}
      onPress={() => {
        router.push({
          pathname: "/transfer-history/[transferId]",
          params: { transferId: transfer.transferId },
        });
      }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <IconTransferDirection direction={transfer.direction} />
      <View style={styles.details}>
        <TextBody strong>{transfer.counterparty.registeredName}</TextBody>
        <TextBody tone="secondary">
          {transferTime === null
            ? statusWord
            : t("history.transfer.time_and_status", {
                time: transferTime,
                status: statusWord,
              })}
        </TextBody>
      </View>
      {parsedAmount && (
        <TextBody strong>
          {moneyMovedSign === 0
            ? traceFormatCalls(formatMoney)(parsedAmount)
            : traceFormatCalls(formatMoney)(
                {
                  ...parsedAmount,
                  minor: asSen(moneyMovedSign * parsedAmount.minor),
                },
                { signDisplay: "exceptZero" },
              )}
        </TextBody>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  itemPressed: { opacity: 0.8 },
  details: { flex: 1 },
});
