import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { type BankErrorBody, sendToBank } from "@/test/bank-client";
import { pressHardwareBack } from "@/test/hardware-back";
import { mswServer } from "@/test/msw-server";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

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
        () =>
          HttpResponse.json({
            daily: {
              limit: { minor: 500_000, currency: "MYR" },
              usedToday: { minor: 0, currency: "MYR" },
              remaining: { minor: 500_000, currency: "MYR" },
            },
            perTransferMax: { minor: 5_000_000, currency: "MYR" },
          } satisfies GetTransferLimitsResponse),
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
        `Transfers are unavailable right now, until ${formatMalaysianDateTime(maintenanceAnswer.error.until ?? "")}.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/more today/)).toBeNull();
  }),
);
