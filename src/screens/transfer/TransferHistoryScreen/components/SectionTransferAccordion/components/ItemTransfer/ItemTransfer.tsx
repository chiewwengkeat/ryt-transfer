import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import {
  type Transfer,
  TransferDirection,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word/use-transfer-status-word";
import { formatMalaysianTime } from "@/shared/lib/dates/dates";
import { asSen, formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace/render-trace";
import { colors, spacing, typography } from "@/shared/theme/theme";
import CardPressable from "@/shared/ui/CardPressable/CardPressable";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  transfer: Transfer;
}
export default function ItemTransfer({ transfer }: Props) {
  useRenderTrace("row", transfer.transferId);
  const { t } = useTranslation(["transfer", "shared"]);
  const { fontScale } = useWindowDimensions();
  const statusWord = useTransferStatusWord(transfer);
  const parsedAmount = parseWireAmount(transfer.amount);
  const moneyMovedSign = MONEY_MOVED_SIGN[transfer.funds];
  const transferTime = traceFormatCalls(formatMalaysianTime)(
    transfer.createdAt,
    t,
  );

  return (
    <CardPressable
      onPress={() => {
        router.push({
          pathname: "/transfer-history/[transferId]",
          params: { transferId: transfer.transferId },
        });
      }}
      styles={{ main: styles.main }}
    >
      <View style={styles.item}>
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
                : t("item_transfer.time_and_status", {
                    time: transferTime,
                    status: statusWord,
                  })}
            </TextBody>
          </View>
          {parsedAmount && (
            <View style={styles.amount}>
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
            </View>
          )}
        </View>
      </View>
    </CardPressable>
  );
}

const styles = StyleSheet.create({
  main: { marginBottom: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
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
  // Shrinkable so the details' seven ems count: Yoga ignores a lone flexible child's basis.
  amount: { flexShrink: 1 },
});

interface IconTransferDirectionProps {
  direction: TransferDirection;
}
function IconTransferDirection({ direction }: IconTransferDirectionProps) {
  return (
    <View aria-hidden style={iconTransferDirectionStyles.circle}>
      <View
        style={[
          iconTransferDirectionStyles.arrow,
          direction === TransferDirection.In
            ? iconTransferDirectionStyles.received
            : iconTransferDirectionStyles.sent,
        ]}
      >
        <View style={iconTransferDirectionStyles.shaft} />
        <View style={iconTransferDirectionStyles.head} />
      </View>
    </View>
  );
}

const iconTransferDirectionStyles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  arrow: { width: 14, height: 14, alignItems: "center" },
  sent: { transform: [{ rotate: "45deg" }] },
  received: { transform: [{ rotate: "225deg" }] },
  shaft: {
    position: "absolute",
    top: 1,
    bottom: 0,
    width: 2,
    backgroundColor: colors.textPrimary,
  },
  head: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: "45deg" }],
  },
});
