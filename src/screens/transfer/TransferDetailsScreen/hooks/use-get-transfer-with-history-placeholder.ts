import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getTransferOptions } from "@/domains/transfer/api/get-transfer/get-transfer";
import { findTransferInHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import { parseWireAmount } from "@/shared/lib/money/money";

export function useGetTransferWithHistoryPlaceholder(transferId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    ...getTransferOptions(transferId),
    placeholderData: () => {
      const listed = findTransferInHistory(queryClient, transferId);
      // The select runs on a placeholder too, and its throw would show as a failure while the fetch is on its way.
      return listed && parseWireAmount(listed.amount) ? listed : undefined;
    },
    select: (transfer) => {
      const amount = parseWireAmount(transfer.amount);
      if (!amount) throw new TypeError("The transfer's amount is unreadable.");
      return { ...transfer, amount };
    },
  });
}
