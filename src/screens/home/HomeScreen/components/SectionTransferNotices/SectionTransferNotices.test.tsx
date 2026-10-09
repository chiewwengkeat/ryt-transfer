import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import {
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { requestJson } from "@/shared/http/transport";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { clearTransferScenario } from "@/test/clear-transfer-scenario";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { reportedScenarios } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
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
    bankAnswer,
    recipientName: lookup.recipient.registeredName,
  };
}

const readsOfTheBalance = () =>
  sentRequests.filter(
    ({ method, url }) => method === "GET" && url.endsWith("/accounts/primary"),
  ).length;

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
  "tells Home at launch how a transfer last seen processing ended (%s), until it is dismissed, and not again at the next launch",
  async (_, statusNow, ending) => {
    const { view, recipientName } =
      await launchWithATransferLastSeenProcessing(statusNow);
    const endingNotice = `Your transfer of RM 100.00 to ${recipientName} ${ending}`;

    expect(await screen.findByText(endingNotice)).toBeOnTheScreen();
    expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", {
        name: `Dismiss the notice about RM 100.00 to ${recipientName}`,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
    });
    await relaunchApp(view);
    await expect(
      screen.findByText(endingNotice, {}, { timeout: 500 }),
    ).rejects.toThrow("Unable to find an element with text");
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

it("keeps checking a transfer Home warns about while Home stays open, and tells Home how it ended once the bank answers", async () => {
  const { bankAnswer, recipientName } =
    await launchWithATransferLastSeenProcessing({
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
    });
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  bankAnswer.transfer = {
    ...bankAnswer.transfer,
    status: TransferStatus.Completed,
    version: bankAnswer.transfer.version + 1,
  };

  await act(() => jest.advanceTimersByTimeAsync(15_000));

  expect(
    await screen.findByText(
      `Your transfer of RM 100.00 to ${recipientName} was sent — money moved.`,
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByText(STILL_BEING_CHECKED)).toBeNull();
});

it(
  "keeps checking from Home a transfer Result could not reach the bank about, and tells Home how it ended once the bank answers",
  scenarioTest("transfer.status_unreachable", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
    );
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
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    await act(() => jest.advanceTimersByTimeAsync(17_000));
    await screen.findByRole("header", { name: "Still checking your transfer" });
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByText(/^Your last transfer is still being checked/),
    ).toBeOnTheScreen();
    clearTransferScenario();

    await act(() => jest.advanceTimersByTimeAsync(15_000));

    expect(
      await screen.findByText(
        /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText(/^Your last transfer is still being checked/),
    ).toBeNull();
  }),
);

it("shows the balance and today's limit read again once Home's check finds the transfer it warned about has ended", async () => {
  const { body: account } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  const { body: limits } = await sendToBank<GetTransferLimitsResponse>(
    "GET",
    "/transfer-limits",
  );
  const { bankAnswer } = await launchWithATransferLastSeenProcessing({
    status: TransferStatus.Processing,
    funds: TransferFunds.Debited,
  });
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  expect(screen.getByText("RM 12,845.50")).toBeOnTheScreen();
  mswServer.use(
    http.get("*/accounts/primary", () =>
      HttpResponse.json({
        ...account,
        balance: { ...account.balance, minor: account.balance.minor - 10_000 },
      }),
    ),
    http.get("*/transfer-limits", () =>
      HttpResponse.json({
        ...limits,
        daily: {
          ...limits.daily,
          remaining: {
            ...limits.daily.remaining,
            minor: limits.daily.remaining.minor - 10_000,
          },
        },
      }),
    ),
  );
  bankAnswer.transfer = {
    ...bankAnswer.transfer,
    status: TransferStatus.Completed,
    version: bankAnswer.transfer.version + 1,
  };

  await act(() => jest.advanceTimersByTimeAsync(15_000));

  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
  expect(
    screen.getByText("You can send RM 4,900.00 more today"),
  ).toBeOnTheScreen();
});

it.each([
  [
    "at the version the app already holds",
    (transfer: Transfer) => ({
      status: TransferStatus.Completed,
      version: transfer.version,
    }),
  ],
  [
    "with an amount the app cannot read",
    (transfer: Transfer) => ({
      status: TransferStatus.Completed,
      version: transfer.version + 1,
      amount: { ...transfer.amount, minor: 0.5 },
    }),
  ],
])(
  "reads the balance again once, not at every later check, when the bank says the transfer Home warns about ended %s",
  async (_, endTheTransfer) => {
    const { bankAnswer } = await launchWithATransferLastSeenProcessing({
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
    });
    expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
    const readsBeforeTheTransferEnded = readsOfTheBalance();
    bankAnswer.transfer = {
      ...bankAnswer.transfer,
      ...endTheTransfer(bankAnswer.transfer),
    };

    for (let check = 0; check < 4; check++)
      await act(() => jest.advanceTimersByTimeAsync(15_000));

    expect(readsOfTheBalance() - readsBeforeTheTransferEnded).toBe(1);
  },
);

it("stops checking the transfer Home warns about while the session-ended view covers Home", async () => {
  const { bankAnswer } = await launchWithATransferLastSeenProcessing({
    status: TransferStatus.Processing,
    funds: TransferFunds.Debited,
  });
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  const readsOfTheTransfer = () =>
    sentRequests.filter(
      ({ method, url }) =>
        method === "GET" &&
        url.endsWith(`/transfers/${bankAnswer.transfer.transferId}`),
    ).length;
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  const readsWhenTheSessionEnded = readsOfTheTransfer();

  await act(() => jest.advanceTimersByTimeAsync(31_000));

  expect(readsOfTheTransfer()).toBe(readsWhenTheSessionEnded);
});

async function sendHomesCheckWithItsAnswerThatTheTransferEndedStillOut(
  bankAnswer: Awaited<
    ReturnType<typeof launchWithATransferLastSeenProcessing>
  >["bankAnswer"],
) {
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  bankAnswer.transfer = {
    ...bankAnswer.transfer,
    status: TransferStatus.Completed,
    version: bankAnswer.transfer.version + 1,
  };
  mswServer.use(
    http.get("*/transfers/:transferId", async () => {
      await delay(5_000);
      return HttpResponse.json(bankAnswer);
    }),
  );
  await act(() => jest.advanceTimersByTimeAsync(15_000));
}

it("sends nothing more under the session-ended view when Home's check that was out finds the transfer has ended", async () => {
  const { bankAnswer } = await launchWithATransferLastSeenProcessing({
    status: TransferStatus.Processing,
    funds: TransferFunds.Debited,
  });
  await sendHomesCheckWithItsAnswerThatTheTransferEndedStillOut(bankAnswer);
  mswServer.use(
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(async () => {
    await requestJson("/any-request").catch(() => undefined);
  });
  expect(
    screen.getByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  const requestsWhenTheSessionEnded = sentRequests.length;

  await act(() => jest.advanceTimersByTimeAsync(6_000));

  expect(
    sentRequests.slice(requestsWhenTheSessionEnded).map(({ url }) => url),
  ).toEqual([]);
});

it("still reads Home's balance again when Home is left while its check that finds the transfer has ended is out", async () => {
  const { bankAnswer } = await launchWithATransferLastSeenProcessing({
    status: TransferStatus.Processing,
    funds: TransferFunds.Debited,
  });
  await sendHomesCheckWithItsAnswerThatTheTransferEndedStillOut(bankAnswer);
  await fireEvent.press(
    screen.getByRole("button", { name: "Transfer history" }),
  );
  const readsWhenHomeWasLeft = readsOfTheBalance();

  await act(() => jest.advanceTimersByTimeAsync(6_000));

  expect(readsOfTheBalance()).toBe(readsWhenHomeWasLeft + 1);
});

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
  const firstSentNotice = `Your transfer of RM 100.00 to ${recipientName} was sent — money moved.`;
  const secondSentNotice = `Your transfer of RM 50.00 to ${recipientName} was sent — money moved.`;

  const view = await renderRoute("/");

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
    expect(screen.queryByText(secondSentNotice)).toBeNull();
  });
  expect(screen.getByText(firstSentNotice)).toBeOnTheScreen();
  await relaunchApp(view);
  expect(await screen.findByText(firstSentNotice)).toBeOnTheScreen();
  await expect(
    screen.findByText(secondSentNotice, {}, { timeout: 500 }),
  ).rejects.toThrow("Unable to find an element with text");
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
