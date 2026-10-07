import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

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

it("moves on to review with an amount within the balance and both limits", async () => {
  const view = await openAmountStep();
  await screen.findByText("RM 12,845.50");

  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "5000");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(view.getPathname()).toBe("/transfer/review");
});

it("asks for an amount before moving on, and for one with at most two decimals", async () => {
  const view = await openAmountStep();

  await fireEvent.press(await screen.findByRole("button", { name: "Review" }));
  expect(screen.getByHintText("Enter the amount to send.")).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "12.345");
  expect(
    screen.getByHintText(
      "Enter an amount in ringgit, with up to two decimal places.",
    ),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer/amount");
});

it("opens the recipient step instead when no recipient is chosen yet", async () => {
  const view = await renderRoute("/transfer/amount");

  expect(
    await screen.findByLabelText("DuitNow mobile number"),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer");
});
