import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  listPendingTransfers,
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const STILL_BEING_CHECKED =
  "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00";

async function launchWithATransferLastSeenProcessing(
  statusNow: Partial<Transfer>,
) {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const { created, lookup } = await startTestTransfer(10_000);
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
      ...statusNow,
    },
  };
  mswServer.use(
    http.get("*/transfers/:transferId", () => HttpResponse.json(bankAnswer)),
  );
  await renderRoute("/");
  return {
    customerId,
    bankAnswer,
    recipientName: lookup.recipient.registeredName,
  };
}

it.each([
  ["sent", { status: TransferStatus.Completed }, "was sent — money moved."],
  [
    "refunded",
    { status: TransferStatus.Unsuccessful, funds: TransferFunds.Refunded },
    "didn't go through. The money is being, or has been, returned to you automatically.",
  ],
  [
    "declined",
    {
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.NotDebited,
      failureReason: TransferFailureReason.RecipientAccountInactive,
    },
    "was not sent — no money moved.",
  ],
])(
  "tells Home at launch how a transfer last seen processing ended (%s), until it is dismissed",
  async (_, statusNow, ending) => {
    const { customerId, recipientName } =
      await launchWithATransferLastSeenProcessing(statusNow);

    expect(
      await screen.findByText(
        `Your transfer of RM 100.00 to ${recipientName} ${ending}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    });
    expect(await listPendingTransfers(customerId)).toEqual([]);
  },
);

it(
  "warns on Home that the last transfer is still being checked, with the bank's reference and nothing to send again",
  scenarioTest("transfer.earlier_transfer_unconfirmed", async () => {
    await launchWithATransferLastSeenProcessing({
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
    });

    expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  }),
);

it("checks a pending transfer again once they sign back in, and tells Home how it ended", async () => {
  const { bankAnswer, recipientName } =
    await launchWithATransferLastSeenProcessing({
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
    });
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

  expect(
    await screen.findByText(
      `Your transfer of RM 100.00 to ${recipientName} was sent — money moved.`,
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();
});
