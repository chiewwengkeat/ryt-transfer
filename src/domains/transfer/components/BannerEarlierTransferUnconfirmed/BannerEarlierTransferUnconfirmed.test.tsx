import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const STILL_BEING_CHECKED =
  "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00";

async function reviewANewTransferWhileAnEarlierOneIsProcessing() {
  const {
    body: { customerId },
  } = await sendToBank<{ customerId: string }>("GET", "/accounts/primary");
  const { created } = await startTestTransfer(10_000);
  await writePendingTransfer(customerId, {
    transferId: created.transfer.transferId,
    idempotencyKey: "approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  const bankAnswer = {
    transfer: {
      ...created.transfer,
      reference: "20261007C0FFEE00",
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
    },
  };
  mswServer.use(
    http.get("*/transfers/:transferId", () => HttpResponse.json(bankAnswer)),
  );
  await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  return bankAnswer;
}

it(
  "warns on review that the last transfer is still being checked, and still lets them send this one",
  scenarioTest("transfer.earlier_transfer_unconfirmed", async () => {
    await reviewANewTransferWhileAnEarlierOneIsProcessing();

    expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: "Transfer" }),
    ).toBeOnTheScreen();
  }),
);

it("checks the earlier transfer again once they sign back in on review, and stops warning once it has ended", async () => {
  const bankAnswer = await reviewANewTransferWhileAnEarlierOneIsProcessing();
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  let sessionEnded = true;
  mswServer.use(
    http.all("*", () =>
      sessionEnded
        ? HttpResponse.json(
            { code: "SESSION_ENDED", message: "The session has ended." },
            { status: 401 },
          )
        : undefined,
    ),
  );
  bankAnswer.transfer = {
    ...bankAnswer.transfer,
    status: TransferStatus.Completed,
  };

  await act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  sessionEnded = false;
  await fireEvent.press(signInAgain);

  await waitFor(() => {
    expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();
  });
  expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
});
