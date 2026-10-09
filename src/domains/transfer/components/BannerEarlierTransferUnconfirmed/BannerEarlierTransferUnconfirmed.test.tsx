import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";

import {
  type Transfer,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { requestJson } from "@/shared/http/transport";
import { sendToBank, startTestTransfer } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { reportedScenarios } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { relaunchApp, renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";
import { readsOfTheBalance } from "@/test/sent-request-filters";

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

async function launchHomeKeepingAnEarlierTransfer(
  answerItsRead: (transfer: Transfer) => Promise<Response> | Response,
) {
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
  mswServer.use(
    http.get("*/transfers/:transferId", () => answerItsRead(created.transfer)),
  );
  await renderRoute("/");
}

it("reports no earlier transfer still being checked that it warns about only while the launch's read is out, and that read finds ended", async () => {
  let answerTheLaunchRead = () => undefined as void;
  const launchReadHeld = new Promise<void>((release) => {
    answerTheLaunchRead = release;
  });
  await launchHomeKeepingAnEarlierTransfer(async (transfer) => {
    await launchReadHeld;
    return HttpResponse.json({
      transfer: { ...transfer, status: TransferStatus.Completed },
    });
  });
  expect(
    await screen.findByText(/^Your last transfer is still being checked/),
  ).toBeOnTheScreen();

  await act(() => {
    answerTheLaunchRead();
  });

  expect(
    await screen.findByText(/^Your transfer of RM 100\.00 to .+ was sent/),
  ).toBeOnTheScreen();
  expect(reportedScenarios()).not.toContain(
    "transfer.earlier_transfer_unconfirmed",
  );
});

it("reports the earlier transfer still being checked once the launch's read of it fails", async () => {
  await launchHomeKeepingAnEarlierTransfer(
    () => new HttpResponse(null, { status: 503 }),
  );

  expect(
    await screen.findByText(/^Your last transfer is still being checked/),
  ).toBeOnTheScreen();
  await waitFor(() => {
    expect(reportedScenarios()).toContain(
      "transfer.earlier_transfer_unconfirmed",
    );
  });
});

it("goes on warning about the earlier transfer while this one's approval is in flight, and leaves this one to its own answer", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const earlier = await reviewANewTransferWhileAnEarlierOneIsProcessing();
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20_000);
      });
    }),
  );
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await act(() => jest.advanceTimersByTimeAsync(16_000));

  expect(screen.getByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  expect(
    sentRequests.filter(
      ({ method, url }) =>
        method === "GET" &&
        /\/transfers\/[\w-]+$/.test(url) &&
        !url.endsWith(`/transfers/${earlier.transfer.transferId}`),
    ),
  ).toEqual([]);
});

it("keeps warning about the earlier transfer, never this one, when a check of the earlier one is still out as they confirm", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const earlier = await reviewANewTransferWhileAnEarlierOneIsProcessing();
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  mswServer.use(
    http.get("*/transfers/:transferId", async ({ params }) => {
      if (params.transferId !== earlier.transfer.transferId) return undefined;
      await new Promise((resolve) => {
        setTimeout(resolve, 10_000);
      });
      return HttpResponse.json(earlier);
    }),
    http.post("*/transfers/:transferId/approve", async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20_000);
      });
      return HttpResponse.json(
        { error: { code: "APPROVAL_INVALID", message: "Test." } },
        { status: 422 },
      );
    }),
  );
  await act(() => jest.advanceTimersByTimeAsync(15_000));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await act(() => jest.advanceTimersByTimeAsync(11_000));
  const warningsWhileApproving = screen
    .queryAllByText(/^Your last transfer is still being checked/)
    .map((warning) => String(warning.props.children));
  await act(() => jest.advanceTimersByTimeAsync(10_000));

  expect(warningsWhileApproving).toEqual([STILL_BEING_CHECKED]);
  expect(
    await screen.findByText(/The approval couldn't be verified/),
  ).toBeOnTheScreen();
  expect(
    screen
      .queryAllByText(/^Your last transfer is still being checked/)
      .map((warning) => String(warning.props.children)),
  ).toEqual([STILL_BEING_CHECKED]);
});

it(
  "quotes the bank's reference that the result page quoted, after a relaunch whose read of the transfer fails",
  scenarioTest("transfer.processing", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await renderRoute("/");
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
    const quotedOnResult = await screen.findByText(
      /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/,
    );
    const reference = String(quotedOnResult.props.children).replace(
      "If you contact us, quote this reference: ",
      "",
    );
    const stillBeingChecked = `Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: ${reference}`;
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );

    await relaunchApp(view);

    expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();
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
    version: bankAnswer.transfer.version + 1,
  };

  // Review's own reads land first: a focus refetch joins a read in flight rather than sending one.
  await act(() => jest.advanceTimersByTimeAsync(1_000));
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

it("reads the balance again once on review, not at every later check, when the bank says the earlier transfer ended at the version the app holds", async () => {
  const bankAnswer = await reviewANewTransferWhileAnEarlierOneIsProcessing();
  expect(await screen.findByText(STILL_BEING_CHECKED)).toBeOnTheScreen();
  const readsBeforeTheTransferEnded = readsOfTheBalance();
  bankAnswer.transfer = {
    ...bankAnswer.transfer,
    status: TransferStatus.Completed,
  };

  for (let check = 0; check < 4; check++)
    await act(() => jest.advanceTimersByTimeAsync(15_000));

  expect(readsOfTheBalance() - readsBeforeTheTransferEnded).toBe(1);
});

it("sends nothing more under the session-ended view when review's check that was out finds the earlier transfer has ended", async () => {
  const bankAnswer = await reviewANewTransferWhileAnEarlierOneIsProcessing();
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
    http.get("*/any-request", () => new HttpResponse(null, { status: 401 })),
  );
  await act(() => jest.advanceTimersByTimeAsync(15_000));
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
