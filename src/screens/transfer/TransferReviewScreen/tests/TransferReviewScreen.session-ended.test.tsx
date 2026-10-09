import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import {
  holdTheNextTransferRead,
  lookUpTestRecipient,
  mswServer,
  readBankBalanceMinor,
  sentRequests,
} from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import { endTheSessionThroughAnotherRead } from "@/test/render/interrupt-app";
import {
  readBankOnRealTimers,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

import {
  askOpenReviewsNameCheckAgain,
  countSent,
  RECIPIENT_MOBILE,
  waitForHomeToOfferTransfer,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

async function openReviewOfRm100(
  startPath: "/" | "/transfer" = "/transfer",
  note?: string,
) {
  const view = await renderRoute(startPath);
  if (startPath === "/") {
    await waitForHomeToOfferTransfer();
    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
  }
  await walkToTransferReview({ note });
  return view;
}

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

it(
  "checks a lost answer on the result page, and never says no money moved, even after signing in again while the name check is down",
  scenarioTest("transfer.approval_unanswered", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const balanceBeforeMinor = await readBankBalanceMinor();
    const releaseTransferRead = holdTheNextTransferRead();
    const view = await openReviewOfRm100("/");
    const transferButton = await screen.findByRole("button", {
      name: "Transfer",
    });
    // Ends the session at the lost answer's balance re-read, the next account request.
    mswServer.use(
      http.get(
        "*/accounts/primary",
        () =>
          HttpResponse.json(
            { error: { code: "SESSION_ENDED", message: "Test." } },
            { status: 401 },
          ),
        { once: true },
      ),
    );
    await fireEvent.press(transferButton);
    const signInButton = await screen.findByRole(
      "button",
      { name: "Sign in again" },
      { timeout: 10_000 },
    );
    expect(
      await screen.findByRole("header", {
        name: "Checking your transfer",
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "This transfer is being checked, so don't send it again — not confirmed yet.",
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `If you contact us, quote this reference: ${view.getPathname()?.replace("/transfer/result/", "")}`,
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();
    releaseTransferRead();
    mswServer.use(
      http.post("*/recipients/lookup", () =>
        HttpResponse.json(
          { error: { code: "NAME_ENQUIRY_UNAVAILABLE", message: "Test." } },
          { status: 503 },
        ),
      ),
    );

    await fireEvent.press(signInButton);
    // Were sign-in to ask the name check, it would fail only once its retries are spent; asserting sooner passes either way.
    await act(() => jest.advanceTimersByTimeAsync(15_000));

    expect(screen.getByText("Transfer sent")).toBeOnTheScreen();
    expect(view.getPathname()).toMatch(/^\/transfer\/result\/[\w-]+$/);
    expect(screen.queryByText(/no money moved/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeOnTheScreen();
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(
      balanceBeforeMinor - 10_000,
    );
  }),
);

it("keeps the recipient review showed after signing in again, so the transfer carries the same reference", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  mswServer.use(
    http.post(
      "*/transfers",
      () =>
        HttpResponse.json(
          { error: { code: "SESSION_ENDED", message: "Test." } },
          { status: 401 },
        ),
      { once: true },
    ),
  );
  await openReviewOfRm100();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );
  // Were sign-in to ask the name check, this lets its new reference land; pressing sooner sends the first one either way.
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText("Transfer sent");

  const recipientRefs = await Promise.all(
    sentRequests
      .filter(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname.endsWith("/transfers"),
      )
      .map(
        async (request) =>
          ((await request.clone().json()) as { recipientRef: string })
            .recipientRef,
      ),
  );
  expect(recipientRefs).toHaveLength(2);
  expect(recipientRefs[1]).toBe(recipientRefs[0]);
});

it("asks review's name check again once they sign back in, when the ended session cut off their Try again", async () => {
  const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  await openReviewOfRm100();
  await screen.findByText(recipient.registeredName);
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      () =>
        HttpResponse.json(
          { error: { code: "NEW_BANK_CODE", message: "Test." } },
          { status: 400 },
        ),
      { once: true },
    ),
  );
  await askOpenReviewsNameCheckAgain();
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  mswServer.use(
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
  await fireEvent.press(tryAgain);
  const signInAgain = await screen.findByRole("button", {
    name: "Sign in again",
  });
  const nameChecksBeforeSignIn = countSent("POST", "/recipients/lookup");

  await fireEvent.press(signInAgain);

  // ⛔ Wait for the check first: review still shows its last Transfer for a moment after sign-in, so a find passes either way.
  await waitFor(() => {
    expect(countSent("POST", "/recipients/lookup")).toBe(
      nameChecksBeforeSignIn + 1,
    );
  });
  expect(
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  ).toBeOnTheScreen();
  expect(screen.getByText(recipient.registeredName)).toBeOnTheScreen();
});
