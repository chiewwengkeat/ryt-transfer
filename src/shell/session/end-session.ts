import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage";
import { queryClient } from "@/shell/query-client";

// ⛔ Never on a 401: after signing in again, a transfer still being checked needs its record.
export async function endSession() {
  queryClient.clear();
  transferFlowStore.setState(transferFlowStore.getInitialState(), true);
  approvalSettingsStore.setState(approvalSettingsStore.getInitialState(), true);
  await deleteAllSecureRecords();
}
