import {
  getListTransfersOptions,
  isTransferHistoryCached,
  resetTransferHistory,
  trimTransferHistory,
  useListTransfers,
  wasNewestTransferHistoryPageReadWithin,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import Loader from "@/shared/ui/Loader/Loader";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ViewTransferHistory from "./components/ViewTransferHistory/ViewTransferHistory";
import ViewTransferHistoryFailed from "./components/ViewTransferHistoryFailed/ViewTransferHistoryFailed";

export default function TransferHistoryScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  // Clear on each open: a failure left from an earlier visit would be announced as this one's.
  const [didRefreshFail, setDidRefreshFail] = useState(false);

  const transferHistory = useListTransfers();
  const failure = useQueryError(
    transferHistory.error,
    transferHistory.fetchStatus !== "idle",
  );

  const isFailureSessionEnd = isSessionEndFailure(failure);
  const isFirstPageLoading =
    transferHistory.isPending && !transferHistory.isPaused && failure === null;

  // The query keeps one status, which a page fetch after a failed refresh overwrites: only a refresh's outcome counts.
  useEffect(() => {
    const historyQueryHash = hashKey(getListTransfersOptions().queryKey);
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.query.queryHash !== historyQueryHash ||
        event.query.state.fetchMeta?.fetchMore
      )
        return;
      if (event.action.type === "error") setDidRefreshFail(true);
      // A cache write, a reset's own trim among them, is no refresh.
      else if (event.action.type === "success" && !event.action.manual)
        setDidRefreshFail(false);
    });
  }, [queryClient]);
  // Decision 009: within 30 s of the newest page's read, a back-and-forth asks nothing; later, someone checking here
  // before paying again needs it read again. Never on a cold cache: a reset would cancel its first fetch and ask twice.
  useEffect(() => {
    if (
      isTransferHistoryCached(queryClient) &&
      !wasNewestTransferHistoryPageReadWithin(queryClient, 30_000)
    )
      resetTransferHistory(queryClient);
    // An open draws every cached page at once, so 200 transfers bound it.
    return () => {
      trimTransferHistory(queryClient, 200);
    };
  }, [queryClient]);

  return (
    <>
      <Stack.Screen options={{ title: t("history.title") }} />
      {isFirstPageLoading && <Loader />}
      {!isFirstPageLoading && transferHistory.data === undefined && (
        <ViewTransferHistoryFailed
          errorUpdatedAt={transferHistory.errorUpdatedAt}
          announce={!isFailureSessionEnd}
        />
      )}
      {transferHistory.data !== undefined && (
        <ViewTransferHistory
          transferHistory={transferHistory}
          didRefreshFail={didRefreshFail}
          announce={!isFailureSessionEnd}
        />
      )}
    </>
  );
}
