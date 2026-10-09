import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { biometricPromptsShown } from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { pressHardwareBack } from "@/test/hardware-back";
import { relaunchApp, renderRoute } from "@/test/render-route";

import { endSession } from "./end-session";

it("reopens none of their transfers at the next launch, though one still awaits approval", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const {
    created: { transfer },
  } = await startTestTransfer(10_000);
  const view = await renderRoute("/");
  await screen.findByText("RM 12,845.50");
  await writePendingTransfer(customerId, {
    transferId: transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-08T01:00:00.000Z",
    stage: PendingTransferStage.Approving,
  });

  await act(() => endSession());
  const relaunched = await relaunchApp(view);
  await act(() => jest.advanceTimersByTimeAsync(500));

  expect(relaunched.getPathname()).toBe("/");
});

it("closes the amount step of the transfer they were entering", async () => {
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByLabelText("Amount (RM)");

  await act(() => endSession());

  await waitFor(() => {
    expect(view.getPathname()).toBe("/transfer");
  });
  expect(screen.queryByLabelText("Amount (RM)")).toBeNull();
});

it("opens History on its loader, never on the transfers it showed before the session ended", async () => {
  const transferRowTime = /^\d{1,2}:\d{2} [ap]m · /;
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer history" }),
  );
  expect(await screen.findAllByText(transferRowTime)).not.toHaveLength(0);
  await pressHardwareBack();

  await act(() => endSession());
  await fireEvent.press(
    screen.getByRole("button", { name: "Transfer history" }),
  );

  expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
  expect(screen.queryAllByText(transferRowTime)).toHaveLength(0);
});

it("keeps the host app's choice of the PIN over face or fingerprint, so the next approval asks for the PIN", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await renderRoute("/transfer");

  await act(() => endSession());
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByLabelText("PIN, 0 of 6 digits entered"),
  ).toBeOnTheScreen();
  expect(biometricPromptsShown()).toHaveLength(0);
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

it("closes a PIN sheet left open, so approving from it cannot sit sending into the next session", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  );
  await screen.findByRole("button", { name: "Approve" });

  await act(() => endSession());

  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
});
