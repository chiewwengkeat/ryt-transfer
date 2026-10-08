import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http } from "msw";
import { AccessibilityInfo } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
  listPendingTransfers,
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/hooks/pending-transfers";
import {
  lookUpTestRecipient,
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
} from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "announces an outcome that changes in place, not the one the page opens with, and nothing from Home's banners beneath it",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
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
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await pairPhoneAsTheDemoLaunchDoes();
    await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
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
      await screen.findByRole(
        "header",
        { name: "Checking your transfer" },
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();

    releaseStatusRead();

    expect(
      await screen.findByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(announce.mock.calls).toEqual([
      [
        "This is your first transfer to this recipient. Check the name is who you expect.",
      ],
      ["You're offline. Sending is paused until Ryt can be reached."],
      [
        `Transfer sent. RM 100.00 sent to ${recipient.registeredName} — money moved.`,
      ],
    ]);
  }),
);

it(
  "says a checked approval the bank ended over the balance or limit was not sent, offering only Done",
  scenarioTest("transfer.balance_or_limit_short_at_approval", async () => {
    const {
      body: { customerId },
    } = await sendToBank<GetPrimaryAccountResponse>("GET", "/accounts/primary");
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
      await screen.findByRole("header", { name: "Transfer not sent" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "It was not sent because your balance or limit changed — no money moved.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/quote this reference/)).toBeNull();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel as unknown),
    ).toEqual(["Done"]);
    await waitFor(async () => {
      expect(await listPendingTransfers(customerId)).toEqual([]);
    });
  }),
);
