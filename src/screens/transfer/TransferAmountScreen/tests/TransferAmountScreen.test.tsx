import {
  act,
  fireEvent,
  screen,
  userEvent,
} from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { accountKeys } from "@/domains/account/api/account.keys";
import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import {
  type BankErrorBody,
  readBankBalanceMinor,
  sendToBank,
} from "@/test/mock-bank/mock-bank";
import { clearTransferScenario, mswServer } from "@/test/mock-bank/mock-bank";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/mock-bank/demo-pairing";
import {
  pressHardwareBack,
  pressHandlerOf,
  readBankOnRealTimers,
  scenarioTest,
} from "@/test/render/drive-app";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { askOpenAppToReadAgain, renderRoute } from "@/test/render/render-route";

it(
  "shows the balance and today's remaining limit again on the amount step",
  scenarioTest("transfer.balance_and_limit_shown", async () => {
    await openAmountStep();

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
  }),
);

it(
  "names today's remaining limit when the amount is over it",
  scenarioTest("transfer.amount_too_high", async () => {
    await openAmountStep();
    await screen.findByText("RM 12,845.50");

    await fireEvent.changeText(
      screen.getByLabelText("Amount (RM)"),
      "5,000.01",
    );

    expect(
      screen.getByHintText(
        "That is more than the RM 5,000.00 you can still send today.",
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "names the balance when the amount is over it",
  scenarioTest("transfer.amount_too_high", async () => {
    answerBalanceAndLimits(1_284_550, 2_000_000);
    await openAmountStep();
    await screen.findByText("RM 12,845.50");

    await fireEvent.changeText(
      screen.getByLabelText("Amount (RM)"),
      "12845.51",
    );

    expect(
      screen.getByHintText("That is more than your balance of RM 12,845.50."),
    ).toBeOnTheScreen();
    expect(reportedScenarios()).toContain("transfer.amount_too_high");
  }),
);

it(
  "names the most one transfer can send when the amount is over it",
  scenarioTest("transfer.amount_too_high", async () => {
    answerBalanceAndLimits(10_000_000, 10_000_000);
    await openAmountStep();
    await screen.findByText("RM 100,000.00");

    await fireEvent.changeText(
      screen.getByLabelText("Amount (RM)"),
      "50000.01",
    );

    expect(
      screen.getByHintText(
        "That is more than RM 50,000.00, the most you can send in one transfer.",
      ),
    ).toBeOnTheScreen();
  }),
);

it(
  "holds back an amount the limits could not check, so no money moves for it",
  scenarioTest("transfer.amount_unexpected", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const view = await openAmountStep();
    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "6000");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(view.getPathname()).toBe("/transfer/amount");
    expect(await readBankOnRealTimers(readBankBalanceMinor)).toBe(1_284_550);
  }),
);

it("reports only the session's end when the amount step's own reads answer that it has ended", async () => {
  await openAmountStep();
  await screen.findByText("RM 12,845.50");
  const reportCountBeforeTheEnd = reportedScenarios().length;
  mswServer.use(http.all("*", () => new HttpResponse(null, { status: 401 })));

  askOpenAppToReadAgain(accountKeys.primaryAccount);

  expect(
    await screen.findByRole("header", { name: "Your session has ended" }),
  ).toBeOnTheScreen();
  // ⛔ Keep this wait: without it the reports are read before the balance has failed, and this passes either way.
  await screen.findAllByText("Something unexpected went wrong.", {
    includeHiddenElements: true,
  });
  expect(reportedScenarios().slice(reportCountBeforeTheEnd)).toEqual([
    "transfer.session_ended",
  ]);
});

it("moves on to review with an amount within the balance and both limits", async () => {
  const view = await openAmountStep();
  await screen.findByText("RM 12,845.50");

  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "5000");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(view.getPathname()).toBe("/transfer/review");
});

it("opens one review when Review is pressed twice before the step redraws, and opens it again after Back", async () => {
  const view = await openAmountStep();
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  const pressReview = pressHandlerOf(
    screen.getByRole("button", { name: "Review" }),
  );

  // ⛔ Not two fireEvent.press calls: their acts overlap. In one act both presses land before the redraw.
  await act(() => {
    pressReview();
    pressReview();
  });
  await screen.findByRole("button", { name: "Transfer" });
  await pressHardwareBack();

  expect(view.getPathname()).toBe("/transfer/amount");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));
  expect(view.getPathname()).toBe("/transfer/review");
});

it(
  "shows a new customer's lower daily limit again on the amount step, names it when the amount is over, and moves on with the whole of it",
  scenarioTest("transfer.new_customer_daily_limit", async () => {
    const view = await openAmountStep();
    expect(
      await screen.findByText("You can send RM 1,000.00 more today"),
    ).toBeOnTheScreen();

    await fireEvent.changeText(
      screen.getByLabelText("Amount (RM)"),
      "1,000.01",
    );

    expect(
      screen.getByHintText(
        "That is more than the RM 1,000.00 you can still send today.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Amount (RM)"),
      "1,000.00",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(view.getPathname()).toBe("/transfer/review");
  }),
);

it(
  "says something unexpected went wrong on the amount step, holds Review until the limit loads, and lets a retry load it or Back leave",
  scenarioTest("transfer.amount_unexpected", async () => {
    const view = await openAmountStep();

    expect(
      await screen.findByText("Something unexpected went wrong."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(reportedScenarios()).toContain("transfer.amount_unexpected");
    clearTransferScenario();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();

    await pressHardwareBack();

    expect(view.getPathname()).toBe("/transfer");
  }),
);

it(
  "says the balance couldn't be loaded on the amount step too, and holds Review until it does",
  scenarioTest("transfer.balance_unavailable", async () => {
    await openAmountStep();

    expect(
      await screen.findByText("Your balance couldn't be loaded."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(
      screen.getByText(
        "You can send once your balance and today's limit have loaded.",
      ),
    ).toBeOnTheScreen();
  }),
);

it("says the balance failing on the amount step once while offline, keeping it shown as each re-read fails the same way", async () => {
  const balanceFailure = "Your balance couldn't be loaded.";
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  mswServer.use(http.all("*", () => HttpResponse.error()));
  await openAmountStep();
  await screen.findByText(balanceFailure);

  await act(() => jest.advanceTimersByTimeAsync(40_000));

  expect(screen.getByText(balanceFailure)).toBeOnTheScreen();
  expect(
    announce.mock.calls.filter(([words]) => words === balanceFailure),
  ).toHaveLength(1);
});

it(
  "holds Review until today's limit loads when maintenance began before it ever did, and asks the bank again at the time it gave",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body } = await sendToBank<BankErrorBody>("GET", "/transfer-limits");
    await openAmountStep();

    expect(await screen.findByText("RM 12,845.50")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(
      screen.getByText(
        "You can send once your balance and today's limit have loaded.",
      ),
    ).toBeOnTheScreen();
    clearTransferScenario();
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    await act(() =>
      jest.advanceTimersByTimeAsync(
        Date.parse(body.error.until ?? "") - Date.now(),
      ),
    );

    expect(
      await screen.findByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  }),
);

it(
  "says sending is paused on a transfer step too, where typing stays open",
  scenarioTest("transfer.offline", async () => {
    await openAmountStep();

    expect(
      await screen.findByText(
        "You're offline. Sending is paused until Ryt can be reached.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    expect(screen.getByLabelText("Amount (RM)")).toHaveDisplayValue("100");
  }),
);

it(
  "asks for an amount before moving on, and for one with at most two decimals",
  scenarioTest("transfer.badly_formed_input", async () => {
    const view = await openAmountStep();
    await screen.findByText("RM 12,845.50");

    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByHintText("Enter the amount to send.")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "12.345");
    expect(
      screen.getByHintText(
        "Enter an amount in ringgit, with up to two decimal places.",
      ),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer/amount");
  }),
);

it(
  "says what a note may hold when it has a symbol, and holds Review until it is fixed",
  scenarioTest("transfer.badly_formed_input", async () => {
    const view = await openAmountStep();
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");

    await fireEvent.changeText(
      screen.getByLabelText("Note (optional)"),
      "Lunch!",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));

    expect(
      screen.getByHintText("Use only letters A to Z, numbers and spaces."),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/transfer/amount");
    await fireEvent.changeText(
      screen.getByLabelText("Note (optional)"),
      "Lunch",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(view.getPathname()).toBe("/transfer/review");
  }),
);

it("takes no more than 30 characters in the note", async () => {
  await openAmountStep();
  await screen.findByText("RM 12,845.50");

  await userEvent
    .setup()
    .type(
      screen.getByLabelText("Note (optional)"),
      "Lunch with Ali and Siti at noon",
    );

  expect(screen.getByLabelText("Note (optional)")).toHaveDisplayValue(
    "Lunch with Ali and Siti at noo",
  );
});

it("opens the recipient step instead when no recipient is chosen yet", async () => {
  // Mounted past the link guard, which sends this path Home: only the app's own navigation can try it.
  const view = await renderRoute("/transfer/amount", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByLabelText("DuitNow mobile number"),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer");
});

async function openAmountStep() {
  const view = await renderRoute("/transfer");
  await fireEvent.changeText(
    await screen.findByLabelText("DuitNow mobile number"),
    "012-345 6789",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  return view;
}

function answerBalanceAndLimits(
  balanceMinor: number,
  remainingTodayMinor: number,
) {
  mswServer.use(
    http.get("*/accounts/primary", () =>
      HttpResponse.json({
        customerId: "cus_test",
        accountId: "acc_test",
        balance: { minor: balanceMinor, currency: "MYR" },
      } satisfies GetPrimaryAccountResponse),
    ),
    http.get("*/transfer-limits", () =>
      HttpResponse.json({
        daily: {
          limit: { minor: remainingTodayMinor, currency: "MYR" },
          usedToday: { minor: 0, currency: "MYR" },
          remaining: { minor: remainingTodayMinor, currency: "MYR" },
        },
        perTransferMax: { minor: 5_000_000, currency: "MYR" },
      } satisfies GetTransferLimitsResponse),
    ),
  );
}
