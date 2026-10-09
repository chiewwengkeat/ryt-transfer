import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";

import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { type BankErrorBody, sendToBank } from "@/test/bank-client";
import { pressHardwareBack } from "@/test/hardware-back";
import { moveAppTo } from "@/test/harness/app-state";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

const t = getFixedT(null, ["shared"]);
const LIMITS_OUTSIDE_MAINTENANCE = {
  daily: {
    limit: { minor: 500_000, currency: "MYR" },
    usedToday: { minor: 0, currency: "MYR" },
    remaining: { minor: 500_000, currency: "MYR" },
  },
  perTransferMax: { minor: 5_000_000, currency: "MYR" },
} satisfies GetTransferLimitsResponse;

async function returnToFrontHoldingTheLimitsRead() {
  let limitsAskedAgain = false;
  let answerLimitsAgain = () => {};
  mswServer.use(
    http.get(
      "*/transfer-limits",
      async () => {
        limitsAskedAgain = true;
        // Returning nothing passes the request on to the bank, which answers maintenance again.
        await new Promise<void>((resolve) => {
          answerLimitsAgain = resolve;
        });
      },
      { once: true },
    ),
  );
  moveAppTo("background");
  moveAppTo("active");
  await waitFor(() => {
    expect(limitsAskedAgain).toBe(true);
  });
  await act(() => jest.advanceTimersByTimeAsync(100));
  return () => answerLimitsAgain();
}

it(
  "stops saying how much more can be sent today once maintenance answers a later read, while the amount check keeps the limit already loaded",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body: maintenanceAnswer } = await sendToBank<BankErrorBody>(
      "GET",
      "/transfer-limits",
    );
    mswServer.use(
      http.get(
        "*/transfer-limits",
        () => HttpResponse.json(LIMITS_OUTSIDE_MAINTENANCE),
        { once: true },
      ),
    );
    await renderRoute("/");
    await screen.findByText("You can send RM 5,000.00 more today");

    await fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Amount (RM)"),
      "5000.01",
    );

    await waitFor(() => {
      expect(screen.queryAllByText(/more today/)).toHaveLength(0);
    });
    expect(
      screen.getByHintText(
        "That is more than the RM 5,000.00 you can still send today.",
      ),
    ).toBeOnTheScreen();
    await pressHardwareBack();
    await pressHardwareBack();
    expect(
      await screen.findByText(
        `Transfers are unavailable right now, until ${formatMalaysianDateTime(maintenanceAnswer.error.until ?? "", t)}.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/more today/)).toBeNull();
  }),
);

it(
  "keeps the balance, not a spinner, while maintenance's limits are asked again as the app returns to the front",
  scenarioTest("transfer.under_maintenance", async () => {
    await renderRoute("/");
    await screen.findByText(/^Transfers are unavailable right now, until/);

    const answerLimitsAgain = await returnToFrontHoldingTheLimitsRead();

    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(screen.getByText("RM 12,845.50")).toBeOnTheScreen();
    answerLimitsAgain();
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(
      screen.getByText(/^Transfers are unavailable right now, until/),
    ).toBeOnTheScreen();
    expect(screen.getByText("RM 12,845.50")).toBeOnTheScreen();
    expect(screen.queryByText(/more today/)).toBeNull();
  }),
);

it(
  "keeps saying when maintenance ends under a Transfer that stays off, while its limits are asked again as the app returns to the front",
  scenarioTest("transfer.under_maintenance", async () => {
    await renderRoute("/");
    await screen.findByText(/^Transfers are unavailable right now, until/);

    const answerLimitsAgain = await returnToFrontHoldingTheLimitsRead();

    expect(
      screen.getByText(/^Transfers are unavailable right now, until/),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Transfer", disabled: true }),
    ).toBeOnTheScreen();
    answerLimitsAgain();
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(
      screen.getByText(/^Transfers are unavailable right now, until/),
    ).toBeOnTheScreen();
  }),
);

it(
  "asks the bank again at the time it said maintenance ends, and turns Transfer back on once it is over",
  scenarioTest("transfer.under_maintenance", async () => {
    const { body: maintenanceAnswer } = await sendToBank<BankErrorBody>(
      "GET",
      "/transfer-limits",
    );
    await renderRoute("/");
    await screen.findByText(/^Transfers are unavailable right now, until/);
    mswServer.use(
      http.get("*/transfer-limits", () =>
        HttpResponse.json(LIMITS_OUTSIDE_MAINTENANCE),
      ),
    );
    const msUntilMaintenanceEnds =
      Date.parse(maintenanceAnswer.error.until ?? "") - Date.now();

    await act(() =>
      jest.advanceTimersByTimeAsync(msUntilMaintenanceEnds - 1_000),
    );
    const pausedJustBeforeThatTime =
      screen.queryByText(/^Transfers are unavailable right now/) !== null;
    await act(() => jest.advanceTimersByTimeAsync(2_000));

    expect(pausedJustBeforeThatTime).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 5,000.00 more today"),
    ).toBeOnTheScreen();
  }),
);
