import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  type GetTransferResponse,
  TransferDirection,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  listPendingTransfers,
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import {
  lookUpTestRecipient,
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
} from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { readBankOnRealTimers } from "@/test/read-bank-on-real-timers";
import { relaunchApp, renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const BANK_REFERENCE =
  /^If you contact us, quote this reference: \d{8}[\dA-F]{8}$/;

async function sendRm100FromHome() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
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
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  return view;
}

function transferIdIn(pathname: string | undefined) {
  return pathname?.replace("/transfer/result/", "") ?? "";
}

// The page's only offers: anything more could be a way to send the money twice.
function buttonsOnTheResultPage() {
  return screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as unknown);
}

it(
  "gives a receipt in Malaysia time, and Home's balance and limit move with the money",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    const view = await renderRoute("/");
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
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `RM 100.00 sent to ${recipient.registeredName} — money moved.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("•••• 6789")).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    const { body } = await readBankOnRealTimers(() =>
      sendToBank<GetTransferResponse>(
        "GET",
        view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
      ),
    );
    expect(
      screen.getByText(formatMalaysianDateTime(body.transfer.updatedAt)),
    ).toBeOnTheScreen();
    expect(screen.getByText(body.transfer.reference ?? "")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 4,900.00 more today"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);

it("leaves out the note and reference rows when the bank sends them empty", async () => {
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          transferId: "trf_test",
          version: 3,
          direction: TransferDirection.Out,
          status: TransferStatus.Completed,
          funds: TransferFunds.Debited,
          counterparty: {
            registeredName: "NG CHEE KEONG",
            idType: RecipientIdType.Mobile,
            idValueMasked: "•••• 6789",
            bankName: "Maybank",
          },
          amount: { minor: 10_000, currency: "MYR" },
          note: "",
          reference: "",
          createdAt: "2026-10-07T09:30:00+08:00",
          updatedAt: "2026-10-07T09:30:05+08:00",
        },
      } satisfies GetTransferResponse),
    ),
  );
  await renderRoute("/transfer/result/trf_test", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByText("RM 100.00 sent to NG CHEE KEONG — money moved."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Note")).toBeNull();
  expect(screen.queryByText("Reference")).toBeNull();
});

it(
  "says the bank stopped a transfer its fraud check blocked, and points to the bank, never back to sending",
  scenarioTest("transfer.fraud_blocked", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer stopped" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank stopped this transfer to protect you, and will contact you about it — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "says a held transfer will complete or be refunded, with the bank's reference to quote",
  scenarioTest("transfer.held_for_review", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer on hold" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank is holding this transfer for a security check. It will complete or be refunded — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "says a transfer to an inactive account was declined, with no money moved",
  scenarioTest("transfer.recipient_account_inactive", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer declined" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The transfer was declined — no money moved."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
  }),
);

it(
  "says a processing transfer can take up to a business day, with the bank's reference to quote",
  scenarioTest("transfer.processing", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "It's usually instant, but can take up to one business day. The result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(BANK_REFERENCE)).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "checks a transfer whose approval went unanswered, quoting its id, then shows how it ended",
  scenarioTest("transfer.approval_unanswered", async () => {
    let releaseStatusRead: () => void = () => undefined;
    const statusReadHeld = new Promise<void>((release) => {
      releaseStatusRead = release;
    });
    mswServer.use(
      http.get(
        "*/transfers/:transferId",
        async () => {
          await statusReadHeld;
        },
        { once: true },
      ),
    );
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Checking your transfer" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank's answer did not arrive. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
    releaseStatusRead();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
  }),
);

it("moves Home's balance when a transfer whose answer was lost turns out sent while its result page is open", async () => {
  let bankCommitsApprovals = false;
  let lostApproval: Request | undefined;
  mswServer.use(
    http.post("*/transfers/:transferId/approve", ({ request }) => {
      if (bankCommitsApprovals) return undefined;
      lostApproval ??= request.clone();
      return HttpResponse.error();
    }),
  );
  await sendRm100FromHome();
  await screen.findByRole("button", { name: "Done" }, { timeout: 10_000 });
  bankCommitsApprovals = true;

  // The bank commits only now, after the refresh the approve call made on losing its answer.
  await act(async () => {
    const committed = fetch(lostApproval ?? "");
    await jest.advanceTimersByTimeAsync(100);
    await committed;
  });
  await act(() => jest.advanceTimersByTimeAsync(20_000));
  await screen.findByRole("header", { name: "Transfer sent" });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));

  expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
});

it(
  "treats an approval answer the app does not know like no answer, and shows how the transfer ended",
  scenarioTest("transfer.approval_unknown_answer", async () => {
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/not sent/)).toBeNull();
  }),
);

it(
  "says a transfer the bank cannot find can't be found, to check History, with its id to quote",
  scenarioTest("transfer.last_transfer_not_found", async () => {
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer not found" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Your last transfer can't be found. Check History before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "leaves an unanswered approval's outcome unconfirmed when checking it meets an answer the app does not know",
  scenarioTest("transfer.recovery_unexpected", async () => {
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Outcome not confirmed" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer's outcome can't be confirmed right now. Check History before sending it again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it(
  "keeps the receipt of a transfer the bank completed when a later read of it fails",
  scenarioTest("transfer.completed", async () => {
    mswServer.use(
      http.get("*/transfers/:transferId", () =>
        HttpResponse.json(
          {
            error: {
              code: "NEW_BANK_CODE",
              message: "A code added after this app was built.",
            },
          },
          { status: 400 },
        ),
      ),
    );
    await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(
        sentRequests.filter(({ method, url }) =>
          method === "GET" ? /\/transfers\/[\w-]+$/.test(url) : false,
        ),
      ).not.toHaveLength(0);
    });
    expect(
      screen.getByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/cannot be shown/)).toBeNull();
  }),
);

it(
  "offers to load the result again, never to send again, when the bank answers with an outcome the app cannot name",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    mswServer.use(
      http.post("*/transfers/:transferId/approve", ({ params }) =>
        HttpResponse.json({
          transfer: {
            transferId: params.transferId,
            version: 2,
            direction: TransferDirection.Out,
            // Debited and unsuccessful with no refund under way: whether the money comes back is unsaid.
            status: TransferStatus.Unsuccessful,
            funds: TransferFunds.Debited,
            failureReason: TransferFailureReason.RecipientBankRejected,
            counterparty: recipient,
            amount: { minor: 10_000, currency: "MYR" },
            reference: "20261007C0FFEE00",
            createdAt: "2026-10-07T09:30:00+08:00",
            updatedAt: "2026-10-07T09:30:05+08:00",
          },
        }),
      ),
    );
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The result cannot be shown right now. Check History before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Load the result again", "Done"]);
    const transferId = transferIdIn(view.getPathname());
    const readsBefore = sentRequests.filter(({ url }) =>
      url.endsWith(`/transfers/${transferId}`),
    ).length;

    await fireEvent.press(
      screen.getByRole("button", { name: "Load the result again" }),
    );

    await waitFor(() => {
      expect(
        sentRequests.filter(({ url }) =>
          url.endsWith(`/transfers/${transferId}`),
        ),
      ).toHaveLength(readsBefore + 1);
    });
    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
  }),
);

function answerApprovalAndReadsWithAnUnnamedOutcome(
  recipient: Awaited<ReturnType<typeof lookUpTestRecipient>>["recipient"],
  readAnswer: () => Partial<GetTransferResponse["transfer"]> = () => ({}),
) {
  const unnamedOutcome = (transferId: unknown) => ({
    transferId: String(transferId),
    version: 2,
    direction: TransferDirection.Out,
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.Debited,
    failureReason: TransferFailureReason.RecipientBankRejected,
    counterparty: recipient,
    amount: { minor: 10_000, currency: "MYR" },
    reference: "20261007C0FFEE00",
    createdAt: "2026-10-07T09:30:00+08:00",
    updatedAt: "2026-10-07T09:30:05+08:00",
  });
  mswServer.use(
    http.post("*/transfers/:transferId/approve", ({ params }) =>
      HttpResponse.json({ transfer: unnamedOutcome(params.transferId) }),
    ),
    http.get("*/transfers/:transferId", ({ params }) =>
      HttpResponse.json({
        transfer: { ...unnamedOutcome(params.transferId), ...readAnswer() },
      }),
    ),
  );
}

it(
  "keeps checking a transfer whose outcome the app cannot name, and shows the refund once the bank names it",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    let refunded = false;
    answerApprovalAndReadsWithAnUnnamedOutcome(recipient, () =>
      refunded ? { version: 3, funds: TransferFunds.Refunded } : {},
    );
    await sendRm100FromHome();
    await screen.findByRole("header", { name: "Result not available" });
    refunded = true;

    await act(() => jest.advanceTimersByTimeAsync(3_000));

    expect(
      await screen.findByRole("header", { name: "Transfer refunded" }),
    ).toBeOnTheScreen();
  }),
);

it(
  "keeps warning on Home not to send again a transfer whose outcome the app cannot name",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    answerApprovalAndReadsWithAnUnnamedOutcome(recipient);
    await sendRm100FromHome();
    await screen.findByRole("header", { name: "Result not available" });
    await act(() => jest.advanceTimersByTimeAsync(3_000));

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(
      await screen.findByText(
        "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
  }),
);

async function readCustomerId() {
  const { body } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  return body.customerId;
}

it(
  "keeps checking a processing transfer in place, its record kept as processing, and shows the receipt once it completes",
  scenarioTest("transfer.processing", async () => {
    const customerId = await readCustomerId();
    await sendRm100FromHome();
    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();
    await waitFor(async () => {
      expect(await listPendingTransfers(customerId)).toEqual([
        expect.objectContaining({ stage: PendingTransferStage.Processing }),
      ]);
    });

    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    await waitFor(async () => {
      expect(await listPendingTransfers(customerId)).toEqual([]);
    });
  }),
);

it(
  "says a processing transfer that ends unsuccessful didn't go through, with the money coming back",
  scenarioTest("transfer.refunded_after_processing", async () => {
    await sendRm100FromHome();
    expect(
      await screen.findByRole("header", { name: "Transfer processing" }),
    ).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(
      await screen.findByRole("header", { name: "Transfer refunded" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer didn't go through. The money is being, or has been, returned to you automatically.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
  }),
);

it(
  "says the bank is still unreachable once its reads at 2, 4, 8 and 16 seconds get no answer, quoting the transfer's id",
  scenarioTest("transfer.status_unreachable", async () => {
    const view = await sendRm100FromHome();
    expect(
      await screen.findByRole("header", { name: "Checking your transfer" }),
    ).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(14_000));
    expect(
      screen.queryByRole("header", { name: "Still checking your transfer" }),
    ).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(3_000));

    expect(
      await screen.findByRole("header", {
        name: "Still checking your transfer",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The bank can't be reached right now. This transfer will keep being checked, and the result will show here and in History — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(view.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);
  }),
);

it("still says the bank is unreachable once it stops answering, after answering the page's first read", async () => {
  const { created } = await startTestTransfer(10_000);
  let statusReads = 0;
  mswServer.use(
    http.get("*/transfers/:transferId", () => {
      statusReads += 1;
      return statusReads === 1 ? undefined : HttpResponse.error();
    }),
  );
  await renderRoute(`/transfer/result/${created.transfer.transferId}`);
  await screen.findByRole("header", { name: "Checking your transfer" });
  await act(() => jest.advanceTimersByTimeAsync(14_000));
  expect(
    screen.queryByRole("header", { name: "Still checking your transfer" }),
  ).toBeNull();

  await act(() => jest.advanceTimersByTimeAsync(3_000));

  expect(
    await screen.findByRole("header", { name: "Still checking your transfer" }),
  ).toBeOnTheScreen();
});

it("checks a transfer whose approval drew an answer the app does not know, under that answer's own id", async () => {
  const { created } = await startTestTransfer(10_000);

  await renderRoute(
    `/transfer/result/${created.transfer.transferId}?checking=transfer.approval_unknown_answer`,
  );

  expect(
    await screen.findByRole("header", { name: "Checking your transfer" }),
  ).toBeOnTheScreen();
  expect(observedRecords).toContainEqual(
    expect.objectContaining({
      name: "transfer_outcome",
      properties: { scenario: "transfer.approval_unknown_answer" },
    }),
  );
});

it(
  "reopens the transfer the app was closed during, quoting its id, and says no money moved once its window passes",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    const customerId = await readCustomerId();
    // Never answered: the app is killed while the approval is on its way.
    mswServer.use(
      http.post(
        "*/transfers/:transferId/approve",
        () => new Promise<never>(() => undefined),
        { once: true },
      ),
    );
    const view = await sendRm100FromHome();
    await waitFor(() => {
      expect(sentRequests.some(({ url }) => url.endsWith("/approve"))).toBe(
        true,
      );
    });

    const relaunched = await relaunchApp(view);

    expect(
      await screen.findByRole("header", {
        name: "Checking your last transfer",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The app closed before your last transfer's answer arrived. It's being checked, and its outcome will show here — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${transferIdIn(relaunched.getPathname())}`,
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual(["Done"]);

    await act(() => jest.advanceTimersByTimeAsync(62_000));

    expect(
      await screen.findByRole("header", { name: "Transfer not sent" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("The approval timed out — no money moved."),
    ).toBeOnTheScreen();
    await waitFor(async () => {
      expect(await listPendingTransfers(customerId)).toEqual([]);
    });
  }),
);

it(
  "shows at launch how the transfer the app was closed during ended, then stops tracking it",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    const customerId = await readCustomerId();
    const keys = await pairTestPhone();
    const started = await startTestTransfer(10_000);
    // The approval reached the bank before the app was killed; only its answer was lost.
    await sendToBank("POST", started.approvalPath, {
      body: signTestApproval(started, {
        kind: "biometric",
        keyId: keys.biometricKeyId,
      }),
    });
    await writePendingTransfer(customerId, {
      transferId: started.created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Approving,
    });

    await renderRoute("/");

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    await waitFor(async () => {
      expect(await listPendingTransfers(customerId)).toEqual([]);
    });
  }),
);

it(
  "waits for the account before reopening the transfer left mid-approval, after a launch with no connection",
  scenarioTest("transfer.app_closed_during_approval", async () => {
    const customerId = await readCustomerId();
    const { created } = await startTestTransfer(10_000);
    await writePendingTransfer(customerId, {
      transferId: created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Approving,
    });
    let phoneConnected = false;
    mswServer.use(
      http.all("*", () => (phoneConnected ? undefined : HttpResponse.error())),
    );
    setPhoneNetwork({ isConnected: false, isInternetReachable: false });
    const view = await renderRoute("/");
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    const pathnameWhileOffline = view.getPathname();

    phoneConnected = true;
    await act(() => {
      setPhoneNetwork({ isConnected: true, isInternetReachable: true });
    });

    expect(
      await screen.findByRole("header", {
        name: "Checking your last transfer",
      }),
    ).toBeOnTheScreen();
    expect(pathnameWhileOffline).toBe("/");
  }),
);
