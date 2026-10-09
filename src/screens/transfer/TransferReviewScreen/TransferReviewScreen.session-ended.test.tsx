import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { accountKeys } from "@/domains/account/api/account.keys";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { lookUpTestRecipient } from "@/test/bank-client";
import {
  biometricPromptsShown,
  holdNextBiometricPrompt,
} from "@/test/biometrics-double";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import {
  observedRecords,
  reportedScenarios,
} from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";
import { askOpenAppToReadAgain, renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

async function openReviewOfRm100() {
  await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  await screen.findByRole("button", { name: "Transfer" });
}

async function enterPin(pin: string) {
  for (const digit of pin)
    await fireEvent.press(await screen.findByRole("button", { name: digit }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
}

// A resolver that answers nothing hands the request on to the bank, once released.
function holdTheNextPost(path: string) {
  let sent = false;
  let release = () => undefined as void;
  const held = new Promise<void>((releaseHeld) => {
    release = releaseHeld;
  });
  mswServer.use(
    http.post(
      path,
      async () => {
        sent = true;
        await held;
      },
      { once: true },
    ),
  );
  return {
    release,
    waitUntilSent: () =>
      waitFor(() => {
        expect(sent).toBe(true);
      }),
  };
}

async function endTheSessionThroughAnotherRead() {
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

function scenariosReportedFromNowOn() {
  const reportCountNow = reportedScenarios().length;
  return () => reportedScenarios().slice(reportCountNow);
}

// The scenario forgets only keys registered in an earlier millisecond than it began, and a 1 ms
// timer can fire within the same one, so this waits for the clock itself to move on.
async function pairPhoneBeforeTheBankForgetsItsKeys() {
  await pairPhoneAsTheDemoLaunchDoes();
  const pairedAtMs = Date.now();
  while (Date.now() <= pairedAtMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
}

it(
  "announces and reports a hold the bank answers with under the session-ended view only once signed in again",
  scenarioTest("transfer.account_locked", async () => {
    const holdReason = "Your account is locked. Contact Ryt to unlock it.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();
    const create = holdTheNextPost("*/transfers");
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await create.waitUntilSent();
    const signInButton = await endTheSessionThroughAnotherRead();
    const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
    announce.mockClear();

    create.release();
    await screen.findByText(holdReason, { includeHiddenElements: true });
    const spokenUnderTheView = [...announce.mock.calls];
    const reportedUnderTheView = scenariosReportedSinceTheView();
    await fireEvent.press(signInButton);

    expect(spokenUnderTheView).not.toContainEqual([holdReason]);
    expect(reportedUnderTheView).toEqual([]);
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(holdReason);
    });
    expect(scenariosReportedSinceTheView()).toEqual([
      "transfer.account_locked",
    ]);
  }),
);

it(
  "says a hold once, not again when review is back on top after signing in again",
  scenarioTest("transfer.account_locked", async () => {
    const holdReason = "Your account is locked. Contact Ryt to unlock it.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const timesHoldSpoken = () =>
      announce.mock.calls.filter(([words]) => words === holdReason).length;
    await openReviewOfRm100();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => {
      expect(timesHoldSpoken()).toBe(1);
    });

    await fireEvent.press(await endTheSessionThroughAnotherRead());
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(screen.getByText(holdReason)).toBeOnTheScreen();
    expect(timesHoldSpoken()).toBe(1);
  }),
);

it(
  "speaks the result page's outcome once, not again when that page is back on top after signing in again",
  scenarioTest("transfer.approval_unanswered", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    const outcomeAnnouncement = `Transfer sent. RM 100.00 sent to ${recipient.registeredName} — money moved.`;
    const timesOutcomeSpoken = () =>
      announce.mock.calls.filter(([words]) => words === outcomeAnnouncement)
        .length;
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
    await pairPhoneAsTheDemoLaunchDoes();
    await openReviewOfRm100();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByRole(
      "header",
      { name: "Checking your transfer" },
      { timeout: 10_000 },
    );
    releaseStatusRead();
    await screen.findByRole("header", { name: "Transfer sent" });
    await waitFor(() => {
      expect(timesOutcomeSpoken()).toBe(1);
    });

    await fireEvent.press(await endTheSessionThroughAnotherRead());
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(
      screen.getByRole("header", { name: "Transfer sent" }),
    ).toBeOnTheScreen();
    expect(timesOutcomeSpoken()).toBe(1);
  }),
);

it("reports only the session's end for a transfer the bank would not create because the session had ended, and offers Transfer again once signed in", async () => {
  await openReviewOfRm100();
  const scenariosReportedSinceTheCreate = scenariosReportedFromNowOn();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );

  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );

  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(scenariosReportedSinceTheCreate()).toEqual(["transfer.session_ended"]);
  expect(
    screen.queryByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeNull();
});

it("shows, says and reports no failure of the name check an expired recipient check asks again when the session's end cuts it off, and answers it once signed in", async () => {
  const unexpectedStop =
    "Something unexpected stopped the transfer — no money moved.";
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  const countNameChecks = () =>
    sentRequests.filter(({ url }) => url.endsWith("/recipients/lookup")).length;
  const { recipient } = await lookUpTestRecipient("012-345 6789");
  await openReviewOfRm100();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "RECIPIENT_REF_EXPIRED", message: "Test." } },
          { status: 422 },
        ),
      { once: true },
    ),
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const shownUnderTheView = screen.queryByText(unexpectedStop, {
    includeHiddenElements: true,
  });
  const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
  const nameChecksBeforeSignIn = countNameChecks();

  await fireEvent.press(signInAgain);
  const shownRightAfterSignIn = screen.queryByText(unexpectedStop);
  await waitFor(() => {
    expect(countNameChecks()).toBe(nameChecksBeforeSignIn + 1);
  });
  await screen.findByRole("button", { name: "Transfer", disabled: false });
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(shownUnderTheView).toBeNull();
  expect(shownRightAfterSignIn).toBeNull();
  expect(announce).not.toHaveBeenCalledWith(unexpectedStop);
  expect(scenariosReportedSinceTheView()).toEqual([]);
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
});

it("reports only the session's end for a PIN sheet it closes, which they find closed as not sent once signed in again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await openReviewOfRm100();
  await fireEvent.press(
    screen.getByRole("button", { name: "Use PIN instead" }),
  );
  await screen.findByText("Enter your bank PIN to approve this transfer.");
  const scenariosReportedSinceTheSheet = scenariosReportedFromNowOn();

  await fireEvent.press(await endTheSessionThroughAnotherRead());

  expect(
    await screen.findByText("The transfer was not sent — no money moved."),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(scenariosReportedSinceTheSheet()).toEqual(["transfer.session_ended"]);
});

it("reports only the session's end for a sheet setting approval up again that it closes", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    await openReviewOfRm100();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByText("Approval needs setting up again on this phone.");
    const scenariosReportedSinceTheSheet = scenariosReportedFromNowOn();

    await fireEvent.press(await endTheSessionThroughAnotherRead());

    expect(
      await screen.findByText("The transfer was not sent — no money moved."),
    ).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(scenariosReportedSinceTheSheet()).toEqual([
      "transfer.session_ended",
    ]);
  })();
});

it("reports a PIN the bank locks as it answers under the session-ended view only once signed in again, its sheet still showing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json(
        { error: { code: "PIN_LOCKED", message: "Test." } },
        { status: 423 },
      ),
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  const approval = holdTheNextPost("*/transfers/:transferId/approve");
  await enterPin("111111");
  await approval.waitUntilSent();
  const signInButton = await endTheSessionThroughAnotherRead();
  const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
  const lockedWords =
    "Your PIN is locked. Reset it in the app's security settings.";

  approval.release();
  await screen.findAllByText(lockedWords, { includeHiddenElements: true });
  const reportedUnderTheView = scenariosReportedSinceTheView();
  await fireEvent.press(signInButton);

  expect(reportedUnderTheView).toEqual([]);
  expect(await screen.findAllByText(lockedWords)).not.toHaveLength(0);
  await waitFor(() => {
    expect(scenariosReportedSinceTheView()).toEqual(["transfer.pin_locked"]);
  });
});

it("reports once, after signing in again, a notice the approval leaves review with under the session-ended view", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    mswServer.use(
      http.post(
        "*/approval-keys",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    await openReviewOfRm100();
    const approval = holdTheNextPost("*/transfers/:transferId/approve");
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await approval.waitUntilSent();
    const signInButton = await endTheSessionThroughAnotherRead();
    const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
    const noticeWords = "Approval needs setting up again on this phone.";

    approval.release();
    await screen.findByText(noticeWords, { includeHiddenElements: true });
    const reportedUnderTheView = scenariosReportedSinceTheView();
    await fireEvent.press(signInButton);

    expect(reportedUnderTheView).toEqual([]);
    expect(await screen.findByText(noticeWords)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeOnTheScreen();
    await waitFor(() => {
      expect(scenariosReportedSinceTheView()).toEqual([
        "transfer.approval_key_unknown",
      ]);
    });
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(scenariosReportedSinceTheView()).toEqual([
      "transfer.approval_key_unknown",
    ]);
  })();
});

it("reports a PIN approval that opens under the session-ended view only once signed in again, its sheet still showing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await openReviewOfRm100();
  const create = holdTheNextPost("*/transfers");
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await create.waitUntilSent();
  const signInButton = await endTheSessionThroughAnotherRead();
  const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
  const sheetWords =
    "Face or fingerprint approval isn't available, so approve with your PIN.";

  create.release();
  await screen.findByText(sheetWords, { includeHiddenElements: true });
  const reportedUnderTheView = scenariosReportedSinceTheView();
  await fireEvent.press(signInButton);

  expect(reportedUnderTheView).toEqual([]);
  expect(await screen.findByText(sheetWords)).toBeOnTheScreen();
  await waitFor(() => {
    expect(scenariosReportedSinceTheView()).toEqual([
      "transfer.biometrics_unavailable",
    ]);
  });
});

it("reports a wrong PIN the bank answers under the session-ended view only once signed in again, its sheet still showing", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  approvalSettingsStore.setState({ biometricApprovalOn: false });
  await openReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  const approval = holdTheNextPost("*/transfers/:transferId/approve");
  await enterPin("111111");
  await approval.waitUntilSent();
  const signInButton = await endTheSessionThroughAnotherRead();
  const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
  const refusalWords = "That PIN is incorrect. You have 2 tries left.";

  approval.release();
  await screen.findByText(refusalWords, { includeHiddenElements: true });
  const reportedUnderTheView = scenariosReportedSinceTheView();
  await fireEvent.press(signInButton);

  expect(reportedUnderTheView).toEqual([]);
  expect(await screen.findByText(refusalWords)).toBeOnTheScreen();
  await waitFor(() => {
    expect(scenariosReportedSinceTheView()).toEqual(["transfer.pin_incorrect"]);
  });
});

it("reports no face or fingerprint match that comes back under the session-ended view, even once signed in again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });
  const signInButton = await endTheSessionThroughAnotherRead();
  const scenariosReportedSinceTheView = scenariosReportedFromNowOn();

  releasePrompt();
  await screen.findByText("Transfer sent", { includeHiddenElements: true });
  await fireEvent.press(signInButton);
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(scenariosReportedSinceTheView()).not.toContain(
    "transfer.biometrics_recognised",
  );
});

it("reports the outcome of an approval answered under the session-ended view only once signed in again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  const releasePrompt = holdNextBiometricPrompt();
  await openReviewOfRm100();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  await waitFor(() => {
    expect(biometricPromptsShown()).toHaveLength(1);
  });
  const signInButton = await endTheSessionThroughAnotherRead();
  const recordCountAtTheView = observedRecords.length;
  const outcomesReportedSinceTheView = () =>
    observedRecords
      .slice(recordCountAtTheView)
      .filter(({ name }) => name === "transfer_outcome")
      .map(({ properties }) => properties);

  releasePrompt();
  await screen.findByText("Transfer sent", { includeHiddenElements: true });
  const outcomesUnderTheView = outcomesReportedSinceTheView();
  await fireEvent.press(signInButton);

  expect(outcomesUnderTheView).toEqual([]);
  await waitFor(() => {
    expect(outcomesReportedSinceTheView()).toEqual([
      { scenario: "transfer.completed" },
    ]);
  });
});

it("reports an approval key the bank stops knowing as it answers under the session-ended view only once signed in again, its sheet still showing", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    await openReviewOfRm100();
    const approval = holdTheNextPost("*/transfers/:transferId/approve");
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await approval.waitUntilSent();
    const signInButton = await endTheSessionThroughAnotherRead();
    const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
    const sheetWords = "Approval needs setting up again on this phone.";

    approval.release();
    await screen.findByText(sheetWords, { includeHiddenElements: true });
    const reportedUnderTheView = scenariosReportedSinceTheView();
    await fireEvent.press(signInButton);

    expect(reportedUnderTheView).toEqual([]);
    expect(await screen.findByText(sheetWords)).toBeOnTheScreen();
    await waitFor(() => {
      expect(scenariosReportedSinceTheView()).toEqual([
        "transfer.approval_key_unknown",
      ]);
    });
  })();
});

it("reports a wrong PIN the bank answers while setting approval up again under the session-ended view only once signed in again, its sheet still showing", async () => {
  await pairPhoneBeforeTheBankForgetsItsKeys();
  await scenarioTest("transfer.approval_key_unknown", async () => {
    await openReviewOfRm100();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByText("Approval needs setting up again on this phone.");
    const registration = holdTheNextPost("*/approval-keys");
    await enterPin("111111");
    await registration.waitUntilSent();
    const signInButton = await endTheSessionThroughAnotherRead();
    const scenariosReportedSinceTheView = scenariosReportedFromNowOn();
    const refusalWords = "That PIN is incorrect. You have 2 tries left.";

    registration.release();
    await screen.findByText(refusalWords, { includeHiddenElements: true });
    const reportedUnderTheView = scenariosReportedSinceTheView();
    await fireEvent.press(signInButton);

    expect(reportedUnderTheView).toEqual([]);
    expect(await screen.findByText(refusalWords)).toBeOnTheScreen();
    await waitFor(() => {
      expect(scenariosReportedSinceTheView()).toEqual([
        "transfer.pin_incorrect",
      ]);
    });
  })();
});
