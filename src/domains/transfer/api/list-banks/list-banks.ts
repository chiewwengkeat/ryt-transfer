import { onlineManager, queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { requestJson } from "@/shared/http/transport";

import { transferKeys } from "../transfer.keys";
import type { ListBanksResponse } from "./list-banks.type";

export const getListBanksOptions = () =>
  queryOptions({
    queryKey: transferKeys.banks,
    queryFn: ({ signal }) =>
      requestJson<ListBanksResponse>("/banks", { signal }),
    // Reference data looked up by code: one read serves the whole session.
    staleTime: Infinity,
    gcTime: Infinity,
    // Asked even offline, so the bank sheet's Try again fails visibly instead of pausing unseen.
    networkMode: "always",
    // Not the default under "always": the list must still load by itself once the phone is back.
    refetchOnReconnect: true,
    // Under "always" a failed list is asked again at each return to the front, and an open sheet says it is offline again.
    refetchOnWindowFocus: () => onlineManager.isOnline(),
  });

export function useListBanks() {
  return useQuery({
    ...getListBanksOptions(),
    select: useCallback(
      (banks: ListBanksResponse) =>
        new Map(banks.map((bank) => [bank.bankCode, bank])),
      [],
    ),
  });
}
