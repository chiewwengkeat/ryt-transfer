import { fireEvent, screen } from "@testing-library/react-native";

import type { GetTransferResponse } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { lookUpTestRecipient, sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

it(
  "gives a receipt in Malaysia time, and Home's balance and limit move with the money",
  scenarioTest("transfer.completed", async () => {
    await pairPhoneAsTheDemoLaunchDoes();
    const { recipient } = await lookUpTestRecipient("012-345 6789");
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      "012-345 6789",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("RM 12,845.50");
    await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Review" }));
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    expect(
      await screen.findByText(
        `RM 100.00 sent to ${recipient.registeredName} — money moved.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("•••• 6789")).toBeOnTheScreen();
    expect(screen.getByText(recipient.bankName)).toBeOnTheScreen();
    // The bank answers after a delay, which the route's fake timers would hold forever.
    jest.useRealTimers();
    const { body } = await sendToBank<GetTransferResponse>(
      "GET",
      view.getPathname()?.replace("/transfer/result", "/transfers") ?? "",
    );
    expect(
      screen.getByText(formatMalaysianDateTime(body.transfer.updatedAt)),
    ).toBeOnTheScreen();
    expect(screen.getByText(body.transfer.reference ?? "")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("RM 12,745.50")).toBeOnTheScreen();
    expect(
      screen.getByText("You can send RM 4,900.00 more today"),
    ).toBeOnTheScreen();
    expect(view.getPathname()).toBe("/");
  }),
);
