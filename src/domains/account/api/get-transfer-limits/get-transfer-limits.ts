import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import { TransportError } from "@/shared/http/transport-error";
import { parseWireAmount } from "@/shared/lib/money/money";

import { accountKeys } from "../account.keys";
import {
  GetTransferLimitsErrorCode,
  type GetTransferLimitsErrorResponse,
  type GetTransferLimitsResponse,
} from "./get-transfer-limits.type";

export const getTransferLimitsOptions = () =>
  queryOptions({
    queryKey: accountKeys.transferLimits,
    queryFn: async ({ signal }) => {
      const limits = await requestJson<GetTransferLimitsResponse>(
        "/transfer-limits",
        { signal },
      );
      const remainingToday = parseWireAmount(limits.daily.remaining);
      const perTransferMax = parseWireAmount(limits.perTransferMax);
      if (!remainingToday || !perTransferMax)
        throw new TypeError("The transfer limits are unreadable.");
      return { remainingToday, perTransferMax };
    },
  });

export function useGetTransferLimits(
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({ ...getTransferLimitsOptions(), ...options });
}

export function getTransferLimitsMaintenance(error: unknown) {
  return error instanceof TransportError &&
    error.code === GetTransferLimitsErrorCode.ServiceUnavailable
    ? (error.body as GetTransferLimitsErrorResponse).error
    : undefined;
}
