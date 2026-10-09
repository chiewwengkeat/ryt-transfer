import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { requestJson } from "@/shared/http/transport/transport";

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
