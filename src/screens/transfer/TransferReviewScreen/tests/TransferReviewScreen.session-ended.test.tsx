import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import {
  lookUpTestRecipient,
  mswServer,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { endTheSessionThroughAnotherRead } from "@/test/render/interrupt-app";
import { scenarioTest, walkToTransferReview } from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

async function openReviewOfRm100UntilTransferShows() {
  await renderRoute("/transfer");
  await walkToTransferReview();
  await screen.findByRole("button", { name: "Transfer" });
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

function scenariosReportedFromNowOn() {
  const reportCountNow = reportedScenarios().length;
  return () => reportedScenarios().slice(reportCountNow);
}

it(
  "announces and reports a hold the bank answers with under the session-ended view only once signed in again",
  scenarioTest("transfer.account_locked", async () => {
    const holdReason = "Your account is locked. Contact Ryt to unlock it.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100UntilTransferShows();
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
    await openReviewOfRm100UntilTransferShows();
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
    await openReviewOfRm100UntilTransferShows();
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
  await openReviewOfRm100UntilTransferShows();
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
  await openReviewOfRm100UntilTransferShows();
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
