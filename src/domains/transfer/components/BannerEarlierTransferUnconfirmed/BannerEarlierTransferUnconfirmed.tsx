import { isSettledTransferOutcome } from "@/domains/transfer/api/get-transfer/get-transfer";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import {
  refreshPendingTransferNotices,
  usePendingTransferNotices,
} from "@/domains/transfer/lib/pending-transfer-notices/pending-transfer-notices";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  checkPendingTransferOnce,
  UNSETTLED_TRANSFER_READ_INTERVAL_MS,
} from "@/domains/transfer/lib/transfer-status-checks/transfer-status-checks";
import {
  ScreensCoveredContext,
  useIsScreenOnTop,
} from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { reportError } from "@/shared/observability/observability/observability";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { use, useEffect, useEffectEvent, useRef } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  onEarlierTransferSettled: () => void;
}
export default function BannerEarlierTransferUnconfirmed({
  onEarlierTransferSettled,
}: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();

  const transferIdsToldSettledRef = useRef(new Set<string>());
  const {
    customerId,
    unconfirmed: [newestUnconfirmed],
  } = usePendingTransferNotices();
  const isScreenOnTop = useIsScreenOnTop();
  const isScreenCovered = use(ScreensCoveredContext);
  const tellEarlierTransferSettled = useEffectEvent(
    (settledTransferId: string) => {
      // Covered, not off top: under the session-ended view reads answer 401, but a check out as Home is left still owes it.
      if (isScreenCovered) return;
      // Once per transfer: a settled answer the cached notice cannot show, such as one no newer than the copy held, keeps it ticking.
      if (transferIdsToldSettledRef.current.has(settledTransferId)) return;
      transferIdsToldSettledRef.current.add(settledTransferId);
      onEarlierTransferSettled();
    },
  );

  const transferId = newestUnconfirmed?.transferId;

  // Drawn before the transfer is read, but reported only after: a record kept from before this launch may have ended since.
  useTrackScenarioShown(
    newestUnconfirmed?.checkedWithBank
      ? TransferScenarioId.EarlierTransferUnconfirmed
      : undefined,
  );
  // The bank can answer long after Result was left. Only on top: a Result over this counts each failed read it sees.
  useEffect(() => {
    if (!isScreenOnTop || customerId === undefined || transferId === undefined)
      return;
    let isStopped = false;
    const timer = setInterval(() => {
      // Not during a write: an approval in flight has a record too, and only its own answer may read or list it.
      if (!focusManager.isFocused() || queryClient.isMutating() > 0) return;
      // Nor once one starts while this tick is out, or the session's end clears the cache, which shows only as removals.
      let isOvertaken = false;
      const stopWatchingWrites = queryClient
        .getMutationCache()
        .subscribe(({ type }) => {
          isOvertaken ||= type === "added";
        });
      const stopWatchingClears = queryClient
        .getQueryCache()
        .subscribe(({ type }) => {
          isOvertaken ||= type === "removed";
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
          () => isStopped || isOvertaken,
        );
      })()
        .catch((error: unknown) => {
          reportError(error, { boundary: "pending_transfer" });
        })
        .finally(() => {
          stopWatchingWrites();
          stopWatchingClears();
        });
    }, UNSETTLED_TRANSFER_READ_INTERVAL_MS);
    return () => {
      isStopped = true;
      clearInterval(timer);
    };
  }, [isScreenOnTop, customerId, transferId, queryClient]);

  if (newestUnconfirmed === undefined) return null;

  return (
    <BannerNotice
      message={t("common.earlier_transfer_unconfirmed.body", {
        reference:
          newestUnconfirmed.reference ??
          newestUnconfirmed.transfer?.reference ??
          newestUnconfirmed.transferId,
      })}
    />
  );
}
