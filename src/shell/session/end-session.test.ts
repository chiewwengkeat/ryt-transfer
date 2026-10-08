import type { InfiniteData } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
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
import { relaunchApp, renderRoute } from "@/test/render-route";

import { endSession } from "./end-session";

it("leaves nothing of the customer's behind — their transfer history, the open transfer, the approval setting and their pending transfers — but keeps the phone's pairing", async () => {
  const { customerId } = await queryClient.fetchQuery(
    getPrimaryAccountOptions(),
  );
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
  expect(await approvalKeysOnFile()).toBe(true);
  expect(transferFlowStore.getState()).toEqual(
    transferFlowStore.getInitialState(),
  );
  expect(approvalSettingsStore.getState().biometricApprovalOn).toBe(true);
});

it("approves the first transfer after signing in again with no setting up, because signing out kept the phone paired", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await screen.findByText("RM 12,845.50");

  await act(() => endSession());
  await relaunchApp(view);
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Amount (RM)"),
    "100",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByRole("header", { name: "Transfer sent" }),
  ).toBeOnTheScreen();
});
