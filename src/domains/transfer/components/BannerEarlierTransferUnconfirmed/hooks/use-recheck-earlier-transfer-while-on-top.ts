import { focusManager, useQueryClient } from "@tanstack/react-query";
import { use, useEffect, useEffectEvent, useRef } from "react";

import {
  ScreensCoveredContext,
  useIsScreenOnTop,
} from "@/shared/hooks/use-is-screen-on-top";
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
  const screensCovered = use(ScreensCoveredContext);
  const transferIdsToldSettledRef = useRef(new Set<string>());
  const tellEarlierTransferSettled = useEffectEvent(
    (settledTransferId: string) => {
      // Covered, not off top: under the session-ended view reads answer 401, but a check out as Home is left still owes it.
      if (screensCovered) return;
      // Once per transfer: a settled answer row 5 cannot show, such as one no newer than the copy held, keeps it ticking.
      if (transferIdsToldSettledRef.current.has(settledTransferId)) return;
      transferIdsToldSettledRef.current.add(settledTransferId);
      onSettled();
    },
  );
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
          tellEarlierTransferSettled(transferId);
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
