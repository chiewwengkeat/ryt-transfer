import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import { parseWireAmount } from "@/shared/lib/money/money";

import { transferKeys } from "../transfer.keys";
import type { GetTransferResponse, Transfer } from "./get-transfer.type";

export const getTransferOptions = (transferId: string) =>
  queryOptions({
    queryKey: transferKeys.detail(transferId),
    queryFn: async ({ signal }) =>
      (
        await requestJson<GetTransferResponse>(
          `/transfers/${encodeURIComponent(transferId)}`,
          { signal },
        )
      ).transfer,
    // An answer that left before a newer copy arrived must not replace it.
    structuralSharing: (held: unknown, received: unknown) =>
      held !== undefined &&
      (held as Transfer).version >= (received as Transfer).version
        ? held
        : received,
  });

export function useGetTransfer(transferId: string) {
  return useQuery({
    ...getTransferOptions(transferId),
    select: (transfer) => {
      const amount = parseWireAmount(transfer.amount);
      if (!amount) throw new TypeError("The transfer's amount is unreadable.");
      return { ...transfer, amount };
    },
  });
}
