import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TransportError } from "@/shared/http/transport-error/transport-error";
import { requestJson } from "@/shared/http/transport/transport";
import { parseWireAmount } from "@/shared/lib/money/money";
import { trackEvent } from "@/shared/observability/observability/observability";

import { accountKeys } from "@/domains/account/api/account.keys";
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
      if (!remainingToday || !perTransferMax) {
        trackEvent("unreadable_amount", { boundary: "transfer_limits" });
        throw new TypeError("The transfer limits are unreadable.");
      }
      return { remainingToday, perTransferMax };
    },
  });

export function useGetTransferLimits(
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    ...getTransferLimitsOptions(),
    refetchInterval: ({ state }) => {
      const until = getTransferLimitsMaintenance(state.error)?.until;
      const msUntilMaintenanceEnds =
        until === undefined ? 0 : Date.parse(until) - Date.now();
      // A time already passed reads nothing more: asking again at once would repeat for as long as the bank gives it.
      return msUntilMaintenanceEnds > 0 ? msUntilMaintenanceEnds : false;
    },
    ...options,
  });
}

export function getTransferLimitsMaintenance(error: unknown) {
  if (
    !(error instanceof TransportError) ||
    error.code !== GetTransferLimitsErrorCode.ServiceUnavailable
  )
    return undefined;
  const { until } = (error.body as GetTransferLimitsErrorResponse).error;
  // An unreadable time is dropped: formatting it throws, and the words without a time still serve.
  return { until: Number.isNaN(Date.parse(until ?? "")) ? undefined : until };
}

export function useTransferLimitsMaintenance(
  limits: ReturnType<typeof useGetTransferLimits>,
) {
  const [maintenanceErrorBeforeReRead, setMaintenanceErrorBeforeReRead] =
    useState<Error | null>(null);
  // A re-read of limits that never loaded clears their maintenance answer until it lands: kept, the pause stays.
  const maintenanceError =
    getTransferLimitsMaintenance(limits.error) !== undefined
      ? limits.error
      : limits.isPending && limits.fetchStatus !== "idle"
        ? maintenanceErrorBeforeReRead
        : null;
  if (maintenanceError !== maintenanceErrorBeforeReRead)
    setMaintenanceErrorBeforeReRead(maintenanceError);
  return getTransferLimitsMaintenance(maintenanceError);
}
