import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import {
  clearPendingTransfer,
  listPendingTransfers,
} from "@/domains/transfer/hooks/pending-transfers";
import { transferFlowStore } from "@/screens/transfer/flow-store/flow-store";
import { queryClient } from "@/shell/query-client";

// ⛔ Never on a 401: after signing in again, a transfer still being checked needs its record.
export async function endSession() {
  const customerId = queryClient.getQueryData(
    getPrimaryAccountOptions().queryKey,
  )?.customerId;
  queryClient.clear();
  transferFlowStore.setState(transferFlowStore.getInitialState(), true);
  closeApprovalPinSheet();
  if (customerId === undefined) return;
  // ⛔ Never every secure record: the phone's pairing outlives a session, and without its key ids no transfer approves.
  for (const { transferId } of await listPendingTransfers(customerId))
    await clearPendingTransfer(customerId, transferId);
}
