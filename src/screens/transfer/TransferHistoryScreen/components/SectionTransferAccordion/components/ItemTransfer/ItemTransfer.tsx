import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import type { Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word";
import { formatMalaysianTime } from "@/shared/lib/dates/dates";
import { asSen, formatMoney, parseWireAmount } from "@/shared/lib/money/money";
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

import IconTransferDirection from "./components/IconTransferDirection/IconTransferDirection";

interface Props {
  transfer: Transfer;
}
export default function ItemTransfer({ transfer }: Props) {
  useRenderTrace("row", transfer.transferId);
  const { t, i18n } = useTranslation("transfer");
  const { fontScale } = useWindowDimensions();
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
      <View style={styles.detailsAndAmount}>
        <View
          style={[
            styles.details,
            // Seven ems hold a long word such as "Unsuccessful": an amount that would leave less wraps to its own line.
            { flexBasis: 7 * typography.body.fontSize * fontScale },
          ]}
        >
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
      </View>
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
  detailsAndAmount: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    // Moves only a wrapped amount: to the row's end, under the amounts above it.
    justifyContent: "flex-end",
    alignItems: "center",
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  details: { flexGrow: 1, flexShrink: 1 },
});
