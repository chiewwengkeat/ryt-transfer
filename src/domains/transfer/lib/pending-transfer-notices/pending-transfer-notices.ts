import {
  type QueryClient,
  queryOptions,
  skipToken,
  useQueries,
  useQuery,
} from "@tanstack/react-query";

import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";

import {
  getTransferOptions,
  isSettledTransferOutcome,
  selectTransferWithOutcome,
  type SETTLED_TRANSFER_OUTCOMES,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import { listPendingTransfers } from "@/domains/transfer/lib/pending-transfers/pending-transfers";

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
  [TransferScenarioId.Completed]: NextLaunchNotice.Completed,
  [TransferScenarioId.RefundedAfterProcessing]: NextLaunchNotice.Refunded,
  [TransferScenarioId.FraudBlocked]: NextLaunchNotice.FraudBlocked,
  [TransferScenarioId.RecipientAccountInactive]: NextLaunchNotice.Declined,
  [TransferScenarioId.BalanceOrLimitShortAtApproval]: NextLaunchNotice.Declined,
  [TransferScenarioId.ApprovalExpired]: NextLaunchNotice.Declined,
};

// No query function: whose records these are is known only to the code that changes them, so each refill says.
const getPendingTransferNoticesOptions = () =>
  queryOptions<{
    customerId: string;
    records: Awaited<ReturnType<typeof listPendingTransfers>>;
  }>({
    queryKey: transferKeys.pendingNotices,
    queryFn: skipToken,
  });

export async function refreshPendingTransferNotices(
  queryClient: QueryClient,
  customerId: string,
  listingOutdated = () => false,
) {
  const records = await listPendingTransfers(customerId);
  if (listingOutdated()) return;
  queryClient.setQueryData(getPendingTransferNoticesOptions().queryKey, {
    customerId,
    records,
  });
}

export function usePendingTransferNotices() {
  const { customerId, records = [] } =
    useQuery(getPendingTransferNoticesOptions()).data ?? {};
  const transfers = useQueries({
    queries: records.map(({ transferId }) => ({
      ...getTransferOptions(transferId),
      select: selectTransferWithOutcome,
      // Never read from here: a read must also move its record along, which only the status checks do.
      enabled: false,
    })),
  });
  const newestFirst = records
    .map((record, index) => {
      const transfer = transfers[index]?.data;
      const notice = isSettledTransferOutcome(transfer?.outcome)
        ? NEXT_LAUNCH_NOTICE_OF_OUTCOME[transfer.outcome]
        : undefined;
      return {
        ...record,
        transfer,
        notice,
        checkedWithBank: transfers[index]?.isPending === false,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    customerId,
    unconfirmed: newestFirst.filter(({ notice }) => notice === undefined),
    settled: newestFirst.flatMap(({ transfer, notice, ...record }) =>
      transfer && notice ? [{ ...record, transfer, notice }] : [],
    ),
  };
}
