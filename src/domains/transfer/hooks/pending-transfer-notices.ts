import {
  type QueryClient,
  queryOptions,
  skipToken,
  useQueries,
  useQuery,
} from "@tanstack/react-query";

import {
  getTransferOptions,
  isSettledTransferOutcome,
  selectTransferWithOutcome,
  type SETTLED_TRANSFER_OUTCOMES,
  TransferOutcomeScenario,
} from "../api/get-transfer/get-transfer";
import { transferKeys } from "../api/transfer.keys";
import { listPendingTransfers } from "./pending-transfers";

export enum NextLaunchNotice {
  Completed = "completed",
  Refunded = "refunded",
  Declined = "declined",
  FraudBlocked = "fraud_blocked",
}

const NEXT_LAUNCH_NOTICE_OF_OUTCOME: Record<
  (typeof SETTLED_TRANSFER_OUTCOMES)[number],
  NextLaunchNotice
> = {
  [TransferOutcomeScenario.Completed]: NextLaunchNotice.Completed,
  [TransferOutcomeScenario.RefundedAfterProcessing]: NextLaunchNotice.Refunded,
  [TransferOutcomeScenario.FraudBlocked]: NextLaunchNotice.FraudBlocked,
  [TransferOutcomeScenario.RecipientAccountInactive]: NextLaunchNotice.Declined,
  [TransferOutcomeScenario.BalanceOrLimitShortAtApproval]:
    NextLaunchNotice.Declined,
  [TransferOutcomeScenario.ApprovalExpired]: NextLaunchNotice.Declined,
};

// No query function: whose records these are is known only to the code that changes them, which refills this.
const getPendingTransferNoticesOptions = () =>
  queryOptions<Awaited<ReturnType<typeof listPendingTransfers>>>({
    queryKey: [...transferKeys.all, "pending"],
    queryFn: skipToken,
  });

export async function refreshPendingTransferNotices(
  queryClient: QueryClient,
  customerId: string,
) {
  queryClient.setQueryData(
    getPendingTransferNoticesOptions().queryKey,
    await listPendingTransfers(customerId),
  );
}

export function usePendingTransferNotices() {
  const records = useQuery(getPendingTransferNoticesOptions()).data ?? [];
  const transfers = useQueries({
    queries: records.map(({ transferId }) => ({
      ...getTransferOptions(transferId),
      select: selectTransferWithOutcome,
      // Only Result and the launch check read a transfer's status; a notice shows what they last found.
      enabled: false,
    })),
  });
  const newestFirst = records
    .map((record, index) => {
      const transfer = transfers[index]?.data;
      const notice = isSettledTransferOutcome(transfer?.outcome)
        ? NEXT_LAUNCH_NOTICE_OF_OUTCOME[transfer.outcome]
        : undefined;
      return { ...record, transfer, notice };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    unconfirmed: newestFirst.filter(({ notice }) => notice === undefined),
    settled: newestFirst.flatMap(({ transfer, notice, ...record }) =>
      transfer && notice ? [{ ...record, transfer, notice }] : [],
    ),
  };
}
