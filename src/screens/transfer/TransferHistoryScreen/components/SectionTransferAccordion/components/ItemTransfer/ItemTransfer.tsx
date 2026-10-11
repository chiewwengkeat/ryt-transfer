import { type Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word/use-transfer-status-word";
import ViewAmountWrap from "@/screens/transfer/TransferHistoryScreen/components/SectionTransferAccordion/components/ViewAmountWrap/ViewAmountWrap";
import { formatMalaysianTime } from "@/shared/lib/dates/dates";
import { asSen, formatMoney, parseWireAmount } from "@/shared/lib/money/money";
import {
  traceFormatCalls,
  useRenderTrace,
} from "@/shared/observability/render-trace/render-trace";
import { spacing } from "@/shared/theme/theme";
import CardPressable from "@/shared/ui/CardPressable/CardPressable";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import IconTransferDirection from "./components/IconTransferDirection/IconTransferDirection";

interface Props {
  transfer: Transfer;
}
export default function ItemTransfer({ transfer }: Props) {
  const { t } = useTranslation(["transfer", "shared"]);

  const statusWord = useTransferStatusWord(transfer);

  const parsedAmount = parseWireAmount(transfer.amount);
  const moneyMovedSign = MONEY_MOVED_SIGN[transfer.funds];
  const transferTime = traceFormatCalls(formatMalaysianTime)(
    transfer.createdAt,
    t,
  );

  useRenderTrace("row", transfer.transferId);

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
        <ViewAmountWrap
          columnGap={spacing.md}
          amount={
            parsedAmount && (
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
            )
          }
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
        </ViewAmountWrap>
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
});
