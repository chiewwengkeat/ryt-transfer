import type { InfiniteData } from "@tanstack/react-query";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { approvalKeysOnFile } from "@/domains/approval/hooks/approval-keys";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import {
  listPendingTransfers,
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import {
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import { queryClient } from "@/shell/query-client";
import { sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";

import { endSession } from "./end-session";

it("leaves nothing of the customer's behind: their transfer history, the open transfer, the approval setting and the phone's records", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const { body: historyPage } = await sendToBank<ListTransfersResponse>(
    "GET",
    "/transfers",
  );
  queryClient.setQueryData<InfiniteData<ListTransfersResponse>>(
    transferKeys.history(),
    { pages: [historyPage], pageParams: [null] },
  );
  const cachedHistory = () =>
    queryClient.getQueriesData({ queryKey: transferKeys.historyAll });
  expect(cachedHistory()).toHaveLength(1);
  await writePendingTransfer(customerId, {
    transferId: "trf_unconfirmed",
    idempotencyKey: "key-unconfirmed",
    createdAt: "2026-10-08T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  });
  await pairPhoneAsTheDemoLaunchDoes();
  transferFlowStore.setState(
    { step: TransferFlowStep.Editing, draft: { note: "Rent" } },
    true,
  );
  approvalSettingsStore.setState({ biometricApprovalOn: false });

  await endSession();

  expect(cachedHistory()).toEqual([]);
  expect(await listPendingTransfers(customerId)).toEqual([]);
  expect(await approvalKeysOnFile()).toBe(false);
  expect(transferFlowStore.getState()).toEqual(
    transferFlowStore.getInitialState(),
  );
  expect(approvalSettingsStore.getState().biometricApprovalOn).toBe(true);
});
