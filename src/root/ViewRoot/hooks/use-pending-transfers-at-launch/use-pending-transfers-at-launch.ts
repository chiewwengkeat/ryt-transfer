import { QueryObserver } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { refreshPendingTransferNotices } from "@/domains/transfer/lib/pending-transfer-notices/pending-transfer-notices";
import {
  discardOtherCustomersPendingTransfers,
  listPendingTransfers,
  PendingTransferStage,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { checkPendingTransferOnce } from "@/domains/transfer/lib/transfer-status-checks/transfer-status-checks";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { addUnauthorizedListener } from "@/shared/http/transport/transport";
import { reportError } from "@/shared/observability/observability";
import { queryClient } from "@/root/query-client/query-client";

export function usePendingTransfersAtLaunch() {
  useEffect(() => {
    let launchRecoveryDone = false;
    let recheckDue = true;
    // Records outlive an ended session, so they are checked again once someone signs back in.
    const stopListeningForEndedSessions = addUnauthorizedListener(() => {
      recheckDue = true;
    });
    // Observed rather than read once: offline, or signed out, whose records these are waits for the account.
    const accountObserver = new QueryObserver(
      queryClient,
      getPrimaryAccountOptions(),
    );
    const onAccountRead = ({
      data,
      status,
      fetchStatus,
    }: ReturnType<typeof accountObserver.getCurrentResult>) => {
      // An answered read only: the 401's own result still carries the account read before it.
      if (
        !recheckDue ||
        data === undefined ||
        status !== "success" ||
        fetchStatus !== "idle"
      )
        return;
      recheckDue = false;
      const opensTheTransferLeftMidApproval = !launchRecoveryDone;
      launchRecoveryDone = true;
      void (async () => {
        await discardOtherCustomersPendingTransfers(data.customerId);
        await refreshPendingTransferNotices(queryClient, data.customerId);
        const records = await listPendingTransfers(data.customerId);
        const [newestApproving] = records
          .filter(({ stage }) => stage === PendingTransferStage.Approving)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const reopened = opensTheTransferLeftMidApproval
          ? newestApproving
          : undefined;
        if (reopened !== undefined)
          router.push({
            pathname: "/transfer/result/[transferId]",
            params: {
              transferId: reopened.transferId,
              checking: TransferScenarioId.AppClosedDuringApproval,
            },
          });
        await Promise.all(
          records
            .filter((record) => record !== reopened)
            .map(({ transferId }) =>
              checkPendingTransferOnce(
                queryClient,
                data.customerId,
                transferId,
              ),
            ),
        );
        await refreshPendingTransferNotices(queryClient, data.customerId);
      })().catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfers_at_launch" });
      });
    };
    const stopObservingAccount = accountObserver.subscribe(onAccountRead);
    // clear() removes the query this observer is on, and nothing but setOptions moves an observer onto the next one.
    const stopRebindingAfterClears = queryClient
      .getQueryCache()
      .subscribe(({ type, query }) => {
        if (type === "removed" && query === accountObserver.getCurrentQuery())
          accountObserver.setOptions(getPrimaryAccountOptions());
      });
    onAccountRead(accountObserver.getCurrentResult());
    return () => {
      stopListeningForEndedSessions();
      stopObservingAccount();
      stopRebindingAfterClears();
    };
  }, []);
}
