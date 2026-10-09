import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { accountKeys } from "@/domains/account/api/account.keys";
import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import {
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
import { finishOpeningScreen } from "@/test/finish-opening-screen";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer } from "@/test/msw-server";
import {
  askOpenAppToReadAgain,
  relaunchAppAndWaitForItsLaunchChecks,
  renderRoute,
} from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

// A resolver that answers nothing hands the read on to the bank, once released.
function holdTheNextStatusRead() {
  let releaseStatusRead = () => undefined as void;
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
  return releaseStatusRead;
}

async function sendRm100FromHome() {
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
  return view;
}

async function endTheSessionOverTheResultPage() {
  mswServer.use(
    http.get(
      "*/accounts/primary",
      () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  askOpenAppToReadAgain(accountKeys.primaryAccount);
  return screen.findByRole("button", { name: "Sign in again" });
}

it(
  "announces an outcome that changes in place, not the one the page opens with, and nothing from Home's banners beneath it",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const releaseStatusRead = holdTheNextStatusRead();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await sendRm100FromHome();
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
  "speaks an outcome that changes under the session-ended view only once signed in again",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const releaseStatusRead = holdTheNextStatusRead();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    const signInButton = await endTheSessionOverTheResultPage();
    announce.mockClear();

    releaseStatusRead();
    await screen.findByRole("header", {
      name: "Transfer sent",
      includeHiddenElements: true,
    });
    const spokenUnderTheView = [...announce.mock.calls];
    await fireEvent.press(signInButton);

    const outcomeAnnouncement = `Transfer sent. RM 100.00 sent to ${recipient.registeredName} — money moved.`;
    expect(spokenUnderTheView).not.toContainEqual([outcomeAnnouncement]);
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(outcomeAnnouncement);
    });
  }),
);

it(
  "keeps an outcome that lands under the session-ended view for Home to announce, should the app close before signing in again",
  scenarioTest("transfer.approval_unanswered", async () => {
    const releaseStatusRead = holdTheNextStatusRead();
    const view = await sendRm100FromHome();
    await finishOpeningScreen(
      await screen.findByRole(
        "header",
        { name: "Checking your transfer" },
        { timeout: 10_000 },
      ),
    );
    await endTheSessionOverTheResultPage();
    releaseStatusRead();
    await screen.findByRole("header", {
      name: "Transfer sent",
      includeHiddenElements: true,
    });

    await relaunchAppAndWaitForItsLaunchChecks(view);

    expect(
      screen.getByText(
        /^Your transfer of RM 100\.00 to .+ was sent — money moved\.$/,
      ),
    ).toBeOnTheScreen();
  }),
);

it("reports the outcome shown once, not again when the page is back on top after signing in again", async () => {
  await sendRm100FromHome();
  await finishOpeningScreen(
    await screen.findByRole("header", { name: "Transfer sent" }),
  );
  const signInButton = await endTheSessionOverTheResultPage();

  await fireEvent.press(signInButton);

  expect(
    await screen.findByRole("header", { name: "Transfer sent" }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(
    observedRecords.filter(({ name }) => name === "transfer_outcome"),
  ).toEqual([
    expect.objectContaining({
      properties: { scenario: "transfer.completed" },
    }),
  ]);
});

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

    const view = await renderRoute("/");

    const heading = await screen.findByRole("header", {
      name: "Transfer not sent",
    });
    expect(heading).toBeOnTheScreen();
    await finishOpeningScreen(heading);
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
    const relaunched = await relaunchAppAndWaitForItsLaunchChecks(view);
    expect(screen.queryByText(/^Your (last )?transfer/)).toBeNull();
    expect(relaunched.getPathname()).toBe("/");
  }),
);
