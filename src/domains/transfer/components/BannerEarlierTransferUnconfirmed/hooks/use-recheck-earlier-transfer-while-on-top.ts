import { focusManager, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top";
import { reportError } from "@/shared/observability/observability";

import { refreshPendingTransferNotices } from "../../../hooks/pending-transfer-notices";
import { checkPendingTransferOnce } from "../../../hooks/transfer-status-checks";

// The bank can answer long after Result was left. Only on top: a Result over this counts each failed read it sees.
export function useRecheckEarlierTransferWhileOnTop({
  customerId,
  transferId,
}: {
  customerId: string | undefined;
  transferId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const screenOnTop = useIsScreenOnTop();
  useEffect(() => {
    if (!screenOnTop || customerId === undefined || transferId === undefined)
      return;
    const timer = setInterval(() => {
      // Not during a write: an approval in flight has a record too, and only its own answer may read or list it.
      if (!focusManager.isFocused() || queryClient.isMutating() > 0) return;
      void (async () => {
        await checkPendingTransferOnce(queryClient, customerId, transferId);
        await refreshPendingTransferNotices(queryClient, customerId);
      })().catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfer" });
      });
    }, RECHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [screenOnTop, customerId, transferId, queryClient]);
}

const RECHECK_INTERVAL_MS = 15_000;
