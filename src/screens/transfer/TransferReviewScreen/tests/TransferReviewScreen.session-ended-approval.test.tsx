import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import { mswServer } from "@/test/mock-bank/mock-bank";
import {
  biometricPromptsShown,
  holdNextBiometricPrompt,
} from "@/test/doubles/biometrics-double";
import {
  pairPhoneAsTheDemoLaunchDoes,
  pairPhoneBeforeTheBankForgetsItsKeys,
} from "@/test/mock-bank/demo-pairing";
import { endTheSessionThroughAnotherRead } from "@/test/render/interrupt-app";
import {
  enterPinAndApprove,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import {
  observedRecords,
  reportedScenarios,
} from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

import { walkToTransferReviewUntilTransferShows } from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it("reports only the session's end for a PIN sheet it closes, which they find closed as not sent once signed in again", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
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
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
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
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  const approval = holdTheNextPost("*/transfers/:transferId/approve");
  await enterPinAndApprove("111111");
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
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
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
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
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
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
  await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  const approval = holdTheNextPost("*/transfers/:transferId/approve");
  await enterPinAndApprove("111111");
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
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
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
  await renderRoute("/transfer");
  await walkToTransferReviewUntilTransferShows();
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
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
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
    await renderRoute("/transfer");
    await walkToTransferReviewUntilTransferShows();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await screen.findByText("Approval needs setting up again on this phone.");
    const registration = holdTheNextPost("*/approval-keys");
    await enterPinAndApprove("111111");
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

it("never says the transfer was not sent when the session ends as the bank answers the approval", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post("*/transfers/:transferId/approve", () =>
      HttpResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Test." } },
        { status: 401 },
      ),
    ),
  );
  await renderRoute("/transfer");
  await walkToTransferReview();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(await screen.findByText("Your session has ended")).toBeOnTheScreen();
  // The ended session hides the app from screen readers, the result's notice included.
  expect(
    screen.getByText(
      "This transfer is being checked, so don't send it again — not confirmed yet.",
      { includeHiddenElements: true },
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByText("The transfer was not sent — no money moved.", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

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

function scenariosReportedFromNowOn() {
  const reportCountNow = reportedScenarios().length;
  return () => reportedScenarios().slice(reportCountNow);
}
