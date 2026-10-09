import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import {
  type BankErrorBody,
  lookUpTestRecipient,
  sendToBank,
} from "@/test/mock-bank/mock-bank";
import {
  pressHardwareBack,
  scenarioTest,
  walkToTransferReview,
} from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { mswServer, sentRequests } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";

const t = getFixedT(null, ["shared"]);

afterEach(() => {
  jest.restoreAllMocks();
});

const RECIPIENT_MOBILE = "012-345 6789";

// Home holds Transfer back until its first reads land, so a press made sooner does nothing.
async function waitForHomeToOfferTransfer() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });
}

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

function countSent(method: string, pathEnd: string) {
  return sentRequests.filter(
    (request) =>
      request.method === method &&
      new URL(request.url).pathname.endsWith(pathEnd),
  ).length;
}

async function askBankToCreateRm100() {
  const { recipientRef } = await lookUpTestRecipient(RECIPIENT_MOBILE);
  return sendToBank<BankErrorBody>("POST", "/transfers", {
    body: { recipientRef, amount: { minor: 10_000, currency: "MYR" } },
  });
}

it(
  "says from when money can be sent while a newly paired phone waits, announces it, and holds the transfer",
  scenarioTest("transfer.cooling_off_new_phone", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after pairing this phone.`;
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(holdReason);
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.cooling_off_new_phone");
  }),
);

it(
  "says from when money can be sent in a new account's first hour, announces it, and holds the transfer with no PIN way around it",
  scenarioTest("transfer.cooling_off_new_account", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after opening your account.`;
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(holdReason);
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use PIN instead" }),
    ).toBeNull();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.cooling_off_new_account");
  }),
);

it.each([
  [
    "DEVICE_PAIRED",
    "a time the app cannot read",
    () => "soon",
    "You can send money later — a security wait after pairing this phone.",
  ],
  [
    "NEW_ACCOUNT",
    "a time the app cannot read",
    () => "soon",
    "You can send money later — a security wait after opening your account.",
  ],
  [
    "DEVICE_PAIRED",
    "a time already passed",
    () => new Date(Date.now() - 60_000).toISOString(),
    "You can send money later — a security wait after pairing this phone.",
  ],
])(
  "holds the transfer without a time, and keeps holding it, when the bank's cooling-off for %s comes with %s",
  async (reason, _, untilTheBankSends, holdReason) => {
    mswServer.use(
      http.post("*/transfers", () =>
        HttpResponse.json(
          {
            error: {
              code: "COOLING_OFF",
              message: "Test.",
              until: untilTheBankSends(),
              reason,
            },
          },
          { status: 403 },
        ),
      ),
    );
    await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    expect(await screen.findByText(holdReason)).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(10 * 60_000));

    expect(screen.getByText(holdReason)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
  },
);

it(
  "lifts the hold once the security wait ends, and offers Transfer again",
  scenarioTest("transfer.cooling_off_new_account", async () => {
    const { body } = await askBankToCreateRm100();
    const holdReason = `You can send money from ${formatMalaysianDateTime(body.error.until ?? "", t)} — a security wait after opening your account.`;
    await openReviewOfRm100();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await screen.findByText(holdReason);
    const msUntilTheWaitEnds = Date.parse(body.error.until ?? "") - Date.now();

    await act(() => jest.advanceTimersByTimeAsync(msUntilTheWaitEnds - 1_000));
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    await act(() => jest.advanceTimersByTimeAsync(2_000));

    expect(screen.queryByText(holdReason)).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  }),
);

it("words a cooling-off whose reason the app does not know as a newly paired phone's", async () => {
  const until = new Date(Date.now() + 60 * 60_000).toISOString();
  mswServer.use(
    http.post("*/transfers", () =>
      HttpResponse.json(
        {
          error: {
            code: "COOLING_OFF",
            message: "Test.",
            until,
            reason: "NEW_REASON",
          },
        },
        { status: 403 },
      ),
    ),
  );
  await openReviewOfRm100();

  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  expect(
    await screen.findByText(
      `You can send money from ${formatMalaysianDateTime(until, t)} — a security wait after pairing this phone.`,
    ),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
});

it(
  "says the account is locked and to contact Ryt, announces it, offers no way around it, and lets Back leave",
  scenarioTest("transfer.account_locked", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const view = await openReviewOfRm100();

    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        "Your account is locked. Contact Ryt to unlock it.",
      ),
    ).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(
      "Your account is locked. Contact Ryt to unlock it.",
    );
    expect(screen.getByRole("button", { name: "Transfer" })).toBeDisabled();
    expect(countSent("POST", "/approve")).toBe(0);
    expect(reportedScenarios()).toContain("transfer.account_locked");

    await pressHardwareBack();

    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);
