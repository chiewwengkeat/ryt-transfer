import { focusManager, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top";
import { reportError } from "@/shared/observability/observability";

import { isSettledTransferOutcome } from "../../../api/get-transfer/get-transfer";
import { refreshPendingTransferNotices } from "../../../hooks/pending-transfer-notices";
import { checkPendingTransferOnce } from "../../../hooks/transfer-status-checks";

// The bank can answer long after Result was left. Only on top: a Result over this counts each failed read it sees.
export function useRecheckEarlierTransferWhileOnTop({
  customerId,
  transferId,
  onSettled,
}: {
  customerId: string | undefined;
  transferId: string | undefined;
  onSettled: () => void;
}) {
  const queryClient = useQueryClient();
  const screenOnTop = useIsScreenOnTop();
  const tellEarlierTransferSettled = useEffectEvent(() => {
    onSettled();
  });
  useEffect(() => {
    if (!screenOnTop || customerId === undefined || transferId === undefined)
      return;
    let stopped = false;
    const timer = setInterval(() => {
      // Not during a write: an approval in flight has a record too, and only its own answer may read or list it.
      if (!focusManager.isFocused() || queryClient.isMutating() > 0) return;
      // Nor once one starts while this tick is out, or the session's end clears the cache, which shows only as removals.
      let overtaken = false;
      const stopWatchingWrites = queryClient
        .getMutationCache()
        .subscribe(({ type }) => {
          overtaken ||= type === "added";
        });
      const stopWatchingClears = queryClient
        .getQueryCache()
        .subscribe(({ type }) => {
          overtaken ||= type === "removed";
        });
      void (async () => {
        if (
          isSettledTransferOutcome(
            await checkPendingTransferOnce(queryClient, customerId, transferId),
          )
        )
          tellEarlierTransferSettled();
        await refreshPendingTransferNotices(
          queryClient,
          customerId,
          () => stopped || overtaken,
        );
      })()
        .catch((error: unknown) => {
          reportError(error, { boundary: "pending_transfer" });
        })
        .finally(() => {
          stopWatchingWrites();
          stopWatchingClears();
        });
    }, RECHECK_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [screenOnTop, customerId, transferId, queryClient]);
}

const RECHECK_INTERVAL_MS = 15_000;
