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
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  lookUpTestRecipient,
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  finishOpeningScreen,
  pressHardwareBack,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

async function sendRm100FromHome() {
  await pairPhoneAsTheDemoLaunchDoes();
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );
  await walkToTransferReview();
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
        "The result cannot be shown right now. Check your transfer history before sending this again — not confirmed yet.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "If you contact us, quote this reference: 20261007C0FFEE00",
      ),
    ).toBeOnTheScreen();
    expect(buttonsOnTheResultPage()).toEqual([
      "Transfer history",
      "Load the result again",
      "Done",
    ]);
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
  "opens History in place of the result page, so the page stops reading beneath it and Back from History goes Home",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    answerApprovalAndReadsWithAnUnnamedOutcome(recipient);
    const view = await sendRm100FromHome();
    await screen.findByRole("header", { name: "Result not available" });
    const transferId = transferIdIn(view.getPathname());
    const readsOfTheTransfer = () =>
      sentRequests.filter(({ url }) => url.endsWith(`/transfers/${transferId}`))
        .length;
    const readsBeforeLeaving = readsOfTheTransfer();

    await fireEvent.press(
      screen.getByRole("button", { name: "Transfer history" }),
    );
    await act(() => jest.advanceTimersByTimeAsync(32_000));

    expect(view.getPathname()).toBe("/transfer-history");
    expect(readsOfTheTransfer()).toBe(readsBeforeLeaving);
    await pressHardwareBack();
    expect(view.getPathname()).toBe("/");
  }),
);

it(
  "keeps warning on Home not to send again a transfer whose outcome the app cannot name, at the next launch too",
  scenarioTest("transfer.outcome_unexpected", async () => {
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    answerApprovalAndReadsWithAnUnnamedOutcome(recipient);
    const view = await sendRm100FromHome();
    await screen.findByRole("header", { name: "Result not available" });
    await act(() => jest.advanceTimersByTimeAsync(3_000));

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    const stillBeingChecked =
      "Your last transfer is still being checked, so don't send it again — not confirmed yet. If you contact us, quote this reference: 20261007C0FFEE00";
    expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();

    const relaunched = await relaunchApp(view);

    expect(await screen.findByText(stillBeingChecked)).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(relaunched.getPathname()).toBe("/");
  }),
);

it(
  "offers to load the result again, never to send again, when reading a processing transfer fails in a way the app cannot name",
  scenarioTest("transfer.outcome_unexpected", async () => {
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
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "100",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByRole("header", { name: "Result not available" }),
    ).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel as unknown)
        .sort(),
    ).toEqual(["Done", "Load the result again", "Transfer history"]);
  }),
);

it("keeps an earlier transfer the launch check finds with an outcome the app cannot name as still being checked, so the next launch warns on Home instead of reopening it", async () => {
  const {
    body: { customerId },
  } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
  const keys = await pairTestPhone();
  const earlier = await startTestTransfer(10_000);
  const later = await startTestTransfer(5_000);
  await sendToBank("POST", later.approvalPath, {
    body: signTestApproval(later, {
      kind: "biometric",
      keyId: keys.biometricKeyId,
    }),
  });
  const earlierId = earlier.created.transfer.transferId;
  mswServer.use(
    http.get("*/transfers/:transferId", ({ params }) =>
      params.transferId === earlierId
        ? HttpResponse.json({
            transfer: {
              ...earlier.created.transfer,
              // Debited and unsuccessful with no refund under way: whether the money comes back is unsaid.
              status: TransferStatus.Unsuccessful,
              funds: TransferFunds.Debited,
              failureReason: TransferFailureReason.RecipientBankRejected,
            },
          })
        : undefined,
    ),
  );
  await writePendingTransfer(customerId, {
    transferId: earlierId,
    idempotencyKey: "earlier-approval-key",
    createdAt: "2026-10-07T01:30:00.000Z",
    stage: PendingTransferStage.Approving,
  });
  await writePendingTransfer(customerId, {
    transferId: later.created.transfer.transferId,
    idempotencyKey: "later-approval-key",
    createdAt: "2026-10-07T01:40:00.000Z",
    stage: PendingTransferStage.Approving,
  });

  const view = await renderRoute("/");

  const heading = await screen.findByRole("header", { name: "Transfer sent" });
  expect(heading).toBeOnTheScreen();
  await finishOpeningScreen(heading);

  const relaunched = await relaunchApp(view);

  expect(
    await screen.findByText(/^Your last transfer is still being checked/),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(relaunched.getPathname()).toBe("/");
});
