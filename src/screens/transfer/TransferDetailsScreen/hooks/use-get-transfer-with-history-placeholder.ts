import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getTransferOptions } from "@/domains/transfer/api/get-transfer/get-transfer";
import type { Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { findTransferInHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import { parseWireAmount } from "@/shared/lib/money/money";

export function useGetTransferWithHistoryPlaceholder(transferId: string) {
  const queryClient = useQueryClient();
  const findReadableHistoryRow = () => {
    const historyRow = findTransferInHistory(queryClient, transferId);
    // The select runs on a placeholder too, and its throw would show as a failure while the fetch is on its way.
    return historyRow && parseWireAmount(historyRow.amount)
      ? historyRow
      : undefined;
  };
  const parseTransferAmount = (transfer: Transfer) => {
    const amount = parseWireAmount(transfer.amount);
    if (!amount) throw new TypeError("The transfer's amount is unreadable.");
    return { ...transfer, amount };
  };
  const transferQuery = useQuery({
    ...getTransferOptions(transferId),
    placeholderData: findReadableHistoryRow,
    select: parseTransferAmount,
  });
  // TanStack drops a placeholder once its fetch fails, but a row already on screen stays there.
  const keptHistoryRow = transferQuery.isLoadingError
    ? findReadableHistoryRow()
    : undefined;

  return {
    transferQuery,
    transfer:
      transferQuery.data ??
      (keptHistoryRow && parseTransferAmount(keptHistoryRow)),
  };
}
