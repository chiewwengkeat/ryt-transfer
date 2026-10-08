import { fireEvent, screen } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";

import {
  type GetTransferResponse,
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { lookUpTestRecipient, sendToBank } from "@/test/bank-client";
import { pairPhoneAsTheDemoLaunchDoes } from "@/test/demo-pairing";
import { mswServer } from "@/test/msw-server";
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

it("leaves out the note and reference rows when the bank sends them empty", async () => {
  mswServer.use(
    http.get("*/transfers/:transferId", () =>
      HttpResponse.json({
        transfer: {
          transferId: "trf_test",
          version: 3,
          direction: TransferDirection.Out,
          status: TransferStatus.Completed,
          funds: TransferFunds.Debited,
          counterparty: {
            registeredName: "NG CHEE KEONG",
            idType: RecipientIdType.Mobile,
            idValueMasked: "•••• 6789",
            bankName: "Maybank",
          },
          amount: { minor: 10_000, currency: "MYR" },
          note: "",
          reference: "",
          createdAt: "2026-10-07T09:30:00+08:00",
          updatedAt: "2026-10-07T09:30:05+08:00",
        },
      } satisfies GetTransferResponse),
    ),
  );
  await renderRoute("/transfer/result/trf_test", {
    appDir: "src/app",
    overrides: {},
  });

  expect(
    await screen.findByText("RM 100.00 sent to NG CHEE KEONG — money moved."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Note")).toBeNull();
  expect(screen.queryByText("Reference")).toBeNull();
});
