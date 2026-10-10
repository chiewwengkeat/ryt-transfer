import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { lookUpTestRecipient, mswServer } from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  finishOpeningScreen,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { renderRoute } from "@/test/render/render-route";

import {
  askOpenReviewsNameCheckAgain,
  countSent,
  RECIPIENT_MOBILE,
} from "./TransferReviewScreen.helper";

afterEach(() => {
  jest.restoreAllMocks();
});

it(
  "asks for a second look at the name on a first transfer to the recipient",
  scenarioTest("transfer.first_transfer_to_recipient", async () => {
    await renderRoute("/transfer");
    await walkToTransferReview();

    expect(
      await screen.findByText(
        "This is your first transfer to this recipient. Check the name is who you expect.",
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "says no DuitNow account was found for the ID, and leads back to the recipient step",
  scenarioTest("transfer.recipient_not_found", async () => {
    const view = await renderRoute("/transfer");
    await walkToTransferReview();

    expect(
      await screen.findByText("No DuitNow account was found for this ID."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.recipient_not_found");
    await fireEvent.press(
      screen.getByRole("button", { name: "Change the recipient" }),
    );

    expect(view.getPathname()).toBe("/transfer");
  }),
);

it(
  "says recipient names can't be confirmed right now, and never lets the transfer go ahead without one",
  scenarioTest("transfer.name_check_unavailable", async () => {
    await renderRoute("/transfer");
    await walkToTransferReview();

    expect(
      await screen.findByText("Recipient names can't be confirmed right now."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.name_check_unavailable");
  }),
);

it(
  "asks to try again in a minute after too many name checks, and offers Try again only once that minute has passed",
  scenarioTest("transfer.too_many_name_checks", async () => {
    await renderRoute("/transfer");
    await walkToTransferReview();

    expect(
      await screen.findByText(
        "Too many name checks in a short time. Try again in a minute.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    expect(reportedScenarios()).toContain("transfer.too_many_name_checks");
    await act(() => jest.advanceTimersByTimeAsync(59_000));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(1_000));
    const nameChecksBeforeTryingAgain = countSent("POST", "/recipients/lookup");
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(countSent("POST", "/recipients/lookup")).toBe(
        nameChecksBeforeTryingAgain + 1,
      );
    });
  }),
);

it(
  "says the too-many-checks words once review has finished opening and the screen reader has placed its focus, and not again as Try again appears after the minute",
  scenarioTest("transfer.too_many_name_checks", async () => {
    const tooManyChecks =
      "Too many name checks in a short time. Try again in a minute.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const timesSaid = () =>
      announce.mock.calls.filter(([words]) => words === tooManyChecks).length;
    await renderRoute("/transfer");
    await walkToTransferReview();
    const refusal = await screen.findByText(tooManyChecks);
    const saidWhileReviewOpens = timesSaid();
    await finishOpeningScreen(refusal);
    await act(() => jest.advanceTimersByTimeAsync(500));
    const saidWhileTheFocusLands = timesSaid();
    await act(() => jest.advanceTimersByTimeAsync(500));
    const saidOnceTheFocusHasLanded = timesSaid();

    await act(() => jest.advanceTimersByTimeAsync(60_000));

    expect(saidWhileReviewOpens).toBe(0);
    expect(saidWhileTheFocusLands).toBe(0);
    expect(saidOnceTheFocusHasLanded).toBe(1);
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(timesSaid()).toBe(1);
  }),
);

it(
  "says the too-many-checks words once more when Try again after the minute is refused too",
  scenarioTest("transfer.too_many_name_checks", async () => {
    const tooManyChecks =
      "Too many name checks in a short time. Try again in a minute.";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await renderRoute("/transfer");
    await walkToTransferReview();
    await finishOpeningScreen(await screen.findByText(tooManyChecks));
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    const announcementsBeforeTryAgain = announce.mock.calls.length;

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await act(() => jest.advanceTimersByTimeAsync(5_000));

    expect(screen.getByText(tooManyChecks)).toBeOnTheScreen();
    expect(
      announce.mock.calls
        .slice(announcementsBeforeTryAgain)
        .filter(([message]) => message === tooManyChecks),
    ).toHaveLength(1);
  }),
);

it.each([
  [
    "NAME_ENQUIRY_UNAVAILABLE",
    503,
    "Recipient names can't be confirmed right now.",
  ],
  ["RECIPIENT_NOT_FOUND", 404, "No DuitNow account was found for this ID."],
])(
  "stops offering Transfer once review's name check, asked again, answers %s",
  async (code, status, message) => {
    const { recipient } = await lookUpTestRecipient(RECIPIENT_MOBILE);
    await renderRoute("/transfer");
    await walkToTransferReview();
    await screen.findByText(recipient.registeredName);
    mswServer.use(
      http.post("*/recipients/lookup", () =>
        HttpResponse.json({ error: { code, message: "Test." } }, { status }),
      ),
    );

    await askOpenReviewsNameCheckAgain();

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByText(recipient.registeredName)).toBeNull();
    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
  },
);

it("offers no PIN instead while review's name check, asked again, is running, and offers it again once it answers", async () => {
  await renderRoute("/transfer");
  await walkToTransferReview();
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
  let releaseNameCheck: () => void = () => undefined;
  const nameCheckHeld = new Promise<void>((release) => {
    releaseNameCheck = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/recipients/lookup",
      async () => {
        await nameCheckHeld;
        return undefined;
      },
      { once: true },
    ),
  );

  await askOpenReviewsNameCheckAgain();

  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
  });
  releaseNameCheck();
  expect(
    await screen.findByRole("button", { name: "Use PIN instead" }),
  ).toBeOnTheScreen();
});

it("shows no name-check notice while sending, though review's name check, asked again, fails", async () => {
  await pairPhoneAsTheDemoLaunchDoes();
  let releaseApproval: () => void = () => undefined;
  const approvalHeld = new Promise<void>((release) => {
    releaseApproval = () => {
      release();
    };
  });
  mswServer.use(
    http.post(
      "*/transfers/:transferId/approve",
      async () => {
        await approvalHeld;
        return undefined;
      },
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await walkToTransferReview();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );
  await screen.findByText(
    "Sending your transfer. The bank's answer comes next.",
  );
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      HttpResponse.json(
        { error: { code: "NAME_ENQUIRY_UNAVAILABLE", message: "Test." } },
        { status: 503 },
      ),
    ),
  );

  await askOpenReviewsNameCheckAgain();
  await act(() => jest.advanceTimersByTimeAsync(1_000));

  expect(
    screen.queryByText("Recipient names can't be confirmed right now."),
  ).toBeNull();
  releaseApproval();
  expect(await screen.findByText("Transfer sent")).toBeOnTheScreen();
});

it("says something unexpected stopped the transfer when the name check answers in a way the app does not know", async () => {
  mswServer.use(
    http.post("*/recipients/lookup", () =>
      HttpResponse.json(
        { error: { code: "NEW_BANK_CODE", message: "Unknown to this app." } },
        { status: 400 },
      ),
    ),
  );
  await renderRoute("/transfer");
  await walkToTransferReview();

  expect(
    await screen.findByText(
      "Something unexpected stopped the transfer — no money moved.",
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
});

it(
  "asks to confirm the recipient again once the name check has expired, and checks the name afresh",
  scenarioTest("transfer.name_check_expired", async () => {
    await renderRoute("/transfer");
    await walkToTransferReview();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "The recipient check has expired. Confirm the recipient again.",
      ),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
    });
    expect(countSent("POST", "/recipients/lookup")).toBe(2);
  }),
);
