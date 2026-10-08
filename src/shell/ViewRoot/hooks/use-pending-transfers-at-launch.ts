import { QueryObserver } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  discardOtherCustomersPendingTransfers,
  listPendingTransfers,
  PendingTransferStage,
} from "@/domains/transfer/hooks/pending-transfers";
import { checkPendingTransferOnce } from "@/domains/transfer/hooks/transfer-status-checks";
import { reportError } from "@/shared/observability/observability";
import { queryClient } from "@/shell/query-client";

export function usePendingTransfersAtLaunch() {
  useEffect(() => {
    let launchRecoveryDone = false;
    // Observed rather than read once: offline, or signed out, whose records these are waits for the account.
    const accountObserver = new QueryObserver(
      queryClient,
      getPrimaryAccountOptions(),
    );
    const onAccountRead = ({
      data,
    }: ReturnType<typeof accountObserver.getCurrentResult>) => {
      if (data === undefined || launchRecoveryDone) return;
      launchRecoveryDone = true;
      void (async () => {
        await discardOtherCustomersPendingTransfers(data.customerId);
        const records = await listPendingTransfers(data.customerId);
        const [newestApproving] = records
          .filter(({ stage }) => stage === PendingTransferStage.Approving)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        if (newestApproving !== undefined)
          router.push({
            pathname: "/transfer/result/[transferId]",
            params: {
              transferId: newestApproving.transferId,
              checking: TransferOutcomeScenario.AppClosedDuringApproval,
            },
          });
        await Promise.all(
          records
            .filter((record) => record !== newestApproving)
            .map(({ transferId }) =>
              checkPendingTransferOnce(
                queryClient,
                data.customerId,
                transferId,
              ),
            ),
        );
      })().catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfers_at_launch" });
      });
    };
    const stopObservingAccount = accountObserver.subscribe(onAccountRead);
    onAccountRead(accountObserver.getCurrentResult());
    return stopObservingAccount;
  }, []);
}
