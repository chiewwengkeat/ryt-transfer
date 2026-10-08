import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import {
  TransferDirection,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
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
  const { t } = useTranslation("transfer");
  const statusWord = {
    [TransferStatus.AwaitingApproval]: t(
      "history.transfer.status.awaiting_approval",
    ),
    [TransferStatus.Processing]: transfer.underReview
      ? t("history.transfer.status.held")
      : t("history.transfer.status.processing"),
    [TransferStatus.Completed]:
      transfer.direction === TransferDirection.In
        ? t("history.transfer.status.received")
        : t("history.transfer.status.sent"),
    [TransferStatus.Unsuccessful]: t("history.transfer.status.unsuccessful"),
    [TransferStatus.Expired]: t("history.transfer.status.expired"),
  } satisfies Record<TransferStatus, string>;
  const amount = parseWireAmount(transfer.amount);
  const moneyMovedSign = MONEY_MOVED_SIGN[transfer.funds];
  const transferTime = traceFormatCalls(formatMalaysianTime)(
    transfer.createdAt,
  );

  return (
    <Pressable
      accessibilityRole="button"
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
            ? statusWord[transfer.status]
            : t("history.transfer.time_and_status", {
                time: transferTime,
                status: statusWord[transfer.status],
              })}
        </TextBody>
      </View>
      {amount && (
        <TextBody strong>
          {moneyMovedSign === 0
            ? traceFormatCalls(formatMoney)(amount)
            : traceFormatCalls(formatMoney)(
                { ...amount, minor: asSen(moneyMovedSign * amount.minor) },
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
