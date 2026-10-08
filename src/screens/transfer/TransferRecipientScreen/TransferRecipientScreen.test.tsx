import { fireEvent, screen, userEvent } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { parseTypedAmount } from "@/shared/lib/money/money";
import { renderRoute } from "@/test/render-route";
import { scenarioTest } from "@/test/scenario-test";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "../state/transfer-flow";

it.each(["012-345 6789", "60123456789", "+60 12 345 6789"])(
  "takes %s as a DuitNow mobile number and moves on to the amount",
  async (typedMobile) => {
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer" }),
    );

    await fireEvent.changeText(
      await screen.findByLabelText("DuitNow mobile number"),
      typedMobile,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(view.getPathname()).toBe("/transfer/amount");
  },
);

it("leaves for Home from its header, even when the transfer opened with nothing beneath it", async () => {
  const view = await renderRoute("/transfer");

  await fireEvent.press(
    await screen.findByRole("button", { name: "Back to Home" }),
  );

  expect(
    await screen.findByRole("button", { name: "Transfer" }),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/");
});

it.each([
  [
    "Mobile",
    "DuitNow mobile number",
    "03-2345 6789",
    "Enter a Malaysian mobile number, like 012-345 6789.",
  ],
  [
    "NRIC",
    "NRIC number",
    "90010114567",
    "Enter the 12 digits of the NRIC number.",
  ],
  [
    "Passport",
    "Passport number",
    "12345678",
    "Enter the passport number: a letter, then 5 to 11 letters or digits.",
  ],
  [
    "Business registration",
    "Business registration number",
    "12345A",
    "Enter the business registration number: 12 digits, or 6 or 7 digits and a letter.",
  ],
  [
    "Army/Police",
    "Army or police number",
    "T123",
    "Enter the army or police number: 1 to 3 letters, then 4 to 8 digits.",
  ],
])(
  "says what is wrong with a badly formed %s ID, and stays",
  (idTypeChip, fieldLabel, typedId, formatMessage) =>
    scenarioTest("transfer.badly_formed_input", async () => {
      const view = await renderRoute("/transfer");
      await fireEvent.press(
        await screen.findByRole("radio", { name: idTypeChip }),
      );

      await fireEvent.changeText(screen.getByLabelText(fieldLabel), typedId);
      await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

      expect(screen.getByHintText(formatMessage)).toBeOnTheScreen();
      expect(view.getPathname()).toBe("/transfer");
    })(),
);

it.each([
  ["Mobile", "DuitNow mobile number", "+601123456789"],
  ["NRIC", "NRIC number", "900101145678"],
  ["Passport", "Passport number", "A12345678901"],
  ["Business registration", "Business registration number", "202001012345"],
  ["Army/Police", "Army or police number", "RFT12345678"],
  ["Account number", "Account number", "12345678901234567"],
])(
  "takes the longest %s ID typed with a space between every character, and no character more",
  async (idTypeChip, fieldLabel, longestId) => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderRoute("/transfer");
    await fireEvent.press(
      await screen.findByRole("radio", { name: idTypeChip }),
    );
    const spacedId = [...longestId].join(" ");

    await user.type(screen.getByLabelText(fieldLabel), `${spacedId}0`);

    expect(screen.getByLabelText(fieldLabel)).toHaveDisplayValue(spacedId);
  },
);

it("shows review a passport recipient under its own label, masked", async () => {
  await renderRoute("/transfer");
  await fireEvent.press(await screen.findByRole("radio", { name: "Passport" }));
  await fireEvent.changeText(
    screen.getByLabelText("Passport number"),
    "a1234567",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText("•••• 4567")).toBeOnTheScreen();
  expect(screen.getByText("Passport number")).toBeOnTheScreen();
});

it("sends to an account number at the bank picked from a search", async () => {
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Account number"),
    "5123 4567 8901",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  await fireEvent.changeText(
    await screen.findByLabelText("Search banks"),
    "public",
  );
  const publicBank = await screen.findByRole("button", {
    name: "Public Bank",
  });

  expect(
    screen.queryByRole("button", { name: "Maybank" }),
  ).not.toBeOnTheScreen();
  await fireEvent.press(publicBank);
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("RM 12,845.50");
  await fireEvent.changeText(screen.getByLabelText("Amount (RM)"), "100");
  await fireEvent.press(screen.getByRole("button", { name: "Review" }));

  expect(await screen.findByText("•••• 8901")).toBeOnTheScreen();
  expect(screen.getByText("Account number")).toBeOnTheScreen();
  expect(screen.getByText("Public Bank")).toBeOnTheScreen();
});

it("says, and announces, that no bank matches a search", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));

  await fireEvent.changeText(
    await screen.findByLabelText("Search banks"),
    "zzz",
  );

  expect(
    await screen.findByText("No bank matches your search."),
  ).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith("No bank matches your search.");
});

it("asks for the account's bank before moving on", async () => {
  const view = await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Account number"),
    "512345678901",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

  expect(
    screen.getByHintText("Choose the bank the account is with."),
  ).toBeOnTheScreen();
  expect(view.getPathname()).toBe("/transfer");
});

it("starts blank after a transfer whose approval left unanswered, and keeps none of its amount", async () => {
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: { idType: RecipientIdType.Mobile, idValue: "+60123456789" },
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.AmountEntered,
    amount: parseTypedAmount("100")!,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.Confirmed,
    lookup: {
      recipient: {
        registeredName: "TAN WEI MING",
        idType: RecipientIdType.Mobile,
        idValueMasked: "•••• 6789",
        bankName: "Maybank",
        bankCode: "MBB",
      },
      recipientRef: "ref_unconfirmed",
      refExpiresInSeconds: 600,
      firstTransfer: false,
    },
    idempotencyKey: "create-unconfirmed",
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.Created,
    transferId: "trf_unconfirmed",
    challenge: "challenge-unconfirmed",
    expiresInSeconds: 60,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalSent,
    attemptKey: "approve-unconfirmed",
  });
  const view = await renderRoute("/");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Transfer" }),
  );

  const mobileField = await screen.findByLabelText("DuitNow mobile number");
  expect(mobileField).toHaveDisplayValue("");
  await fireEvent.changeText(mobileField, "012-345 6789");
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
  expect(view.getPathname()).toBe("/transfer/amount");
});
