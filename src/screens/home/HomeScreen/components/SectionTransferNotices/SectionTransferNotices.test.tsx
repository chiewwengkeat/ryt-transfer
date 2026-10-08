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
import { reportedScenarios } from "@/test/harness/recording-sink";
import { mswServer } from "@/test/msw-server";
import { relaunchApp, renderRoute } from "@/test/render-route";
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
  const view = await renderRoute("/");
  return {
    view,
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
  [
    "stopped by the fraud check",
    {
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.NotDebited,
      failureReason: TransferFailureReason.FraudBlocked,
    },
    "was stopped by the bank to protect you. The bank will contact you about it — no money moved.",
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

    await fireEvent.press(
      screen.getByRole("button", {
        name: `Dismiss the notice about RM 100.00 to ${recipientName}`,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
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
    expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
    expect(reportedScenarios()).toContain(
      "transfer.earlier_transfer_unconfirmed",
    );
  }),
);

it("keeps quoting the bank's reference a launch's check found, after a later launch's read of the transfer fails", async () => {
  const { view } = await launchWithATransferLastSeenProcessing({
    status: TransferStatus.Processing,
    funds: TransferFunds.Debited,
  });
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  mswServer.use(
    http.get(
      "*/transfers/:transferId",
      () => new HttpResponse(null, { status: 503 }),
    ),
  );

  await relaunchApp(view);

  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
});

it("shows Dismiss on each notice's control, names its transfer to screen readers, and dismisses only that notice", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const first = await startTestTransfer(10_000);
  const second = await startTestTransfer(5_000);
  await writePendingTransfer(customerId, {
    transferId: first.created.transfer.transferId,
    idempotencyKey: "first-approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  await writePendingTransfer(customerId, {
    transferId: second.created.transfer.transferId,
    idempotencyKey: "second-approval-key",
    createdAt: "2026-10-07T01:40:00.000Z",
    stage: PendingTransferStage.Processing,
  });
  mswServer.use(
    http.get("*/transfers/:transferId", ({ params }) => {
      const { created } =
        params.transferId === first.created.transfer.transferId
          ? first
          : second;
      return HttpResponse.json({
        transfer: { ...created.transfer, status: TransferStatus.Completed },
      });
    }),
  );
  const recipientName = first.lookup.recipient.registeredName;

  await renderRoute("/");

  expect(
    await screen.findByRole("button", {
      name: `Dismiss the notice about RM 100.00 to ${recipientName}`,
    }),
  ).toBeOnTheScreen();
  expect(await screen.findAllByText("Dismiss")).toHaveLength(2);
  await fireEvent.press(
    await screen.findByRole("button", {
      name: `Dismiss the notice about RM 50.00 to ${recipientName}`,
    }),
  );

  await waitFor(() => {
    expect(
      screen.queryByText(
        `Your transfer of RM 50.00 to ${recipientName} was sent — money moved.`,
      ),
    ).toBeNull();
  });
  expect(
    screen.getByText(
      `Your transfer of RM 100.00 to ${recipientName} was sent — money moved.`,
    ),
  ).toBeOnTheScreen();
  expect(await listPendingTransfers(customerId)).toEqual([
    expect.objectContaining({ transferId: first.created.transfer.transferId }),
  ]);
});

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
    version: bankAnswer.transfer.version + 1,
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
