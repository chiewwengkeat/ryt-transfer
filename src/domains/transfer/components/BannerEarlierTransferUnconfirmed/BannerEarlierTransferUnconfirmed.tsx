import { focusManager, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { reportError } from "@/shared/observability/observability";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

import {
  refreshPendingTransferNotices,
  usePendingTransferNotices,
} from "../../hooks/pending-transfer-notices";
import { checkPendingTransferOnce } from "../../hooks/transfer-status-checks";
import { useTrackScenarioShown } from "../../hooks/use-track-scenario-shown";

export default function BannerEarlierTransferUnconfirmed() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const screenFocused = useIsFocused();
  const {
    customerId,
    unconfirmed: [newestUnconfirmed],
  } = usePendingTransferNotices();
  useTrackScenarioShown(
    newestUnconfirmed && "transfer.earlier_transfer_unconfirmed",
  );
  const newestUnconfirmedId = newestUnconfirmed?.transferId;
  // The bank can answer long after Result was left. Only on top: a Result over this counts each failed read it sees.
  useEffect(() => {
    if (
      !screenFocused ||
      customerId === undefined ||
      newestUnconfirmedId === undefined
    )
      return;
    const timer = setInterval(() => {
      // Not during a write: an approval in flight has a record too, and only its own answer may read or list it.
      if (!focusManager.isFocused() || queryClient.isMutating() > 0) return;
      void (async () => {
        await checkPendingTransferOnce(
          queryClient,
          customerId,
          newestUnconfirmedId,
        );
        await refreshPendingTransferNotices(queryClient, customerId);
      })().catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfer" });
      });
    }, RECHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [screenFocused, customerId, newestUnconfirmedId, queryClient]);
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

const RECHECK_INTERVAL_MS = 15_000;
