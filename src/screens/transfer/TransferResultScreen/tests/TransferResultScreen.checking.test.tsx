import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
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
  holdTheNextTransferRead,
  mswServer,
} from "@/test/mock-bank/mock-bank";
import {
  biometricPromptsShown,
  holdNextBiometricPrompt,
} from "@/test/doubles/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { endTheSessionThroughAnotherRead } from "@/test/render/interrupt-app";
import {
  finishOpeningScreen,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { observedRecords } from "@/test/doubles/native-doubles";
import {
  relaunchAppAndWaitForItsLaunchChecks,
  renderRoute,
} from "@/test/render/render-route";

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

// Jest has no screen reader: the focus request is the nearest thing it can see.
function countOutcomeFocusRequestsFromNowOn() {
  const focusRequests = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
  focusRequests.mockClear();
  return () =>
    focusRequests.mock.calls.filter(
      ([target, eventType]) =>
        eventType === "focus" &&
        (target as { props?: { children?: unknown } }).props?.children ===
          "Transfer sent",
    ).length;
}

async function signInAgainAndCountOutcomeFocusRequestsEachHalfSecond(
  signInButton: Parameters<typeof fireEvent.press>[0],
  outcomeFocusRequests: () => number,
) {
  const requestsBeforeSignIn = outcomeFocusRequests();
  await fireEvent.press(signInButton);
  const requestsAtSignIn = outcomeFocusRequests() - requestsBeforeSignIn;
  await act(() => jest.advanceTimersByTimeAsync(500));
  const requestsHalfASecondLater =
    outcomeFocusRequests() - requestsBeforeSignIn;
  await act(() => jest.advanceTimersByTimeAsync(500));
  return [
    requestsAtSignIn,
    requestsHalfASecondLater,
    outcomeFocusRequests() - requestsBeforeSignIn,
  ];
}

it(
  "announces an outcome that changes in place, not the one the page opens with, and nothing from Home's banners beneath it",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const releaseStatusRead = holdTheNextTransferRead();
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
    const releaseStatusRead = holdTheNextTransferRead();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    await sendRm100FromHome();
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    const signInButton = await endTheSessionThroughAnotherRead();
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
  "reads the balance again once a checked approval ends over the balance or limit, so Home shows it as it now is",
  scenarioTest("transfer.balance_or_limit_short_at_approval", async () => {
    const { body: account } = await sendToBank<GetPrimaryAccountResponse>(
      "GET",
      "/accounts/primary",
    );
    const keys = await pairTestPhone();
    const started = await startTestTransfer(10_000);
    await sendToBank("POST", started.approvalPath, {
      body: signTestApproval(started, {
        kind: "biometric",
        keyId: keys.biometricKeyId,
      }),
    });
    await writePendingTransfer(account.customerId, {
      transferId: started.created.transfer.transferId,
      idempotencyKey: "approval-key",
      createdAt: "2026-10-07T01:30:00.000Z",
      stage: PendingTransferStage.Approving,
    });
    const releaseTransferRead = holdTheNextTransferRead();
    const view = await renderRoute("/");
    await screen.findByRole("header", { name: "Checking your last transfer" });
    // Another payment lowers the balance after Home read it and before the bank's answer comes in.
    mswServer.use(
      http.get("*/accounts/primary", () =>
        HttpResponse.json({
          ...account,
          balance: { minor: 1_184_550, currency: "MYR" },
        } satisfies GetPrimaryAccountResponse),
      ),
    );

    releaseTransferRead();
    await screen.findByRole("header", { name: "Transfer not sent" });
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 11,845.50")).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);

it(
  "keeps an outcome that lands under the session-ended view for Home to announce, should the app close before signing in again",
  scenarioTest("transfer.approval_unanswered", async () => {
    const releaseStatusRead = holdTheNextTransferRead();
    const view = await sendRm100FromHome();
    await finishOpeningScreen(
      await screen.findByRole(
        "header",
        { name: "Checking your transfer" },
        { timeout: 10_000 },
      ),
    );
    await endTheSessionThroughAnotherRead();
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
  const signInButton = await endTheSessionThroughAnotherRead();

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

it("moves a screen reader back to the outcome once signed in again, after the reader has placed its own focus", async () => {
  const outcomeFocusRequests = countOutcomeFocusRequestsFromNowOn();
  await sendRm100FromHome();
  await finishOpeningScreen(
    await screen.findByRole("header", { name: "Transfer sent" }),
  );
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  const signInButton = await endTheSessionThroughAnotherRead();
  const requestsBeforeTheView = outcomeFocusRequests();
  await act(() => jest.advanceTimersByTimeAsync(2_000));
  const requestsUnderTheView = outcomeFocusRequests() - requestsBeforeTheView;

  const requestsAfterSignIn =
    await signInAgainAndCountOutcomeFocusRequestsEachHalfSecond(
      signInButton,
      outcomeFocusRequests,
    );

  expect(requestsUnderTheView).toBe(0);
  expect(requestsAfterSignIn).toEqual([0, 0, 1]);
});

it("moves a screen reader to the outcome of a page that opened under the session-ended view only once signed in again, after the reader has placed its own focus", async () => {
  const outcomeFocusRequests = countOutcomeFocusRequestsFromNowOn();
  const releasePrompt = holdNextBiometricPrompt();
  await sendRm100FromHome();
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });
  const signInButton = await endTheSessionThroughAnotherRead();
  releasePrompt();
  await finishOpeningScreen(
    await screen.findByRole("header", {
      name: "Transfer sent",
      includeHiddenElements: true,
    }),
  );
  await act(() => jest.advanceTimersByTimeAsync(2_000));
  const requestsUnderTheView = outcomeFocusRequests();

  const requestsAfterSignIn =
    await signInAgainAndCountOutcomeFocusRequestsEachHalfSecond(
      signInButton,
      outcomeFocusRequests,
    );

  expect(requestsUnderTheView).toBe(0);
  expect(requestsAfterSignIn).toEqual([0, 0, 1]);
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

it(
  "checks a transfer whose approval went unanswered, quoting its id, then shows how it ended",
  scenarioTest("transfer.approval_unanswered", async () => {
    const releaseStatusRead = holdTheNextTransferRead();
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole(
        "header",
        { name: "Checking your transfer" },
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
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
  "treats an approval answer the app does not know like no answer, checking it with its id to quote and only Done, then shows how it ended",
  scenarioTest("transfer.approval_unknown_answer", async () => {
    const releaseStatusRead = holdTheNextTransferRead();
    const view = await sendRm100FromHome();

    expect(
      await screen.findByRole("header", { name: "Checking your transfer" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
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
    expect(screen.queryByText(/not sent/)).toBeNull();
  }),
);

it("checks a transfer whose approval drew an answer the app does not know, under that answer's own id", async () => {
  const { created } = await startTestTransfer(10_000);

  await renderRoute("/");
  await act(() => {
    router.push({
      pathname: "/transfer/result/[transferId]",
      params: {
        transferId: created.transfer.transferId,
        checking: "transfer.approval_unknown_answer",
      },
    });
  });

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
