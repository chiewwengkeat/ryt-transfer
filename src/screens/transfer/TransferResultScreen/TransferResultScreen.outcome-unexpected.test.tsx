import { act, fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { finishOpeningScreen, scenarioTest } from "@/test/render/drive-app";
import { relaunchApp, renderRoute } from "@/test/render/render-route";

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
