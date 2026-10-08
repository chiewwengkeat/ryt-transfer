import { QueryObserver } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import { refreshPendingTransferNotices } from "@/domains/transfer/hooks/pending-transfer-notices";
import {
  discardOtherCustomersPendingTransfers,
  listPendingTransfers,
  PendingTransferStage,
} from "@/domains/transfer/hooks/pending-transfers";
import { checkPendingTransferOnce } from "@/domains/transfer/hooks/transfer-status-checks";
import { addUnauthorizedListener } from "@/shared/http/transport";
import { reportError } from "@/shared/observability/observability";
import { queryClient } from "@/shell/query-client";

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
              checking: TransferOutcomeScenario.AppClosedDuringApproval,
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
    onAccountRead(accountObserver.getCurrentResult());
    return () => {
      stopListeningForEndedSessions();
      stopObservingAccount();
    };
  }, []);
}
