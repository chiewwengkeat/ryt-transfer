import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import { parseWireAmount } from "@/shared/lib/money/money";

import { accountKeys } from "../account.keys";
import type { GetPrimaryAccountResponse } from "./get-primary-account.type";

export const getPrimaryAccountOptions = () =>
  queryOptions({
    queryKey: accountKeys.primaryAccount,
    queryFn: async ({ signal }) => {
      const account = await requestJson<GetPrimaryAccountResponse>(
        "/accounts/primary",
        { signal },
      );
      const balance = parseWireAmount(account.balance);
      if (!balance)
        throw new TypeError("The primary account's balance is unreadable.");
      return { ...account, balance };
    },
  });

export function useGetPrimaryAccount(
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({ ...getPrimaryAccountOptions(), ...options });
}
