import {
  act,
  fireEvent,
  screen,
  userEvent,
} from "@testing-library/react-native";
import { getFixedT } from "i18next";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";

import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { AppLanguage, pickAppLanguage } from "@/shared/i18n/i18n";
import { parseTypedAmount } from "@/shared/lib/money/money";
import { setPickedContactPhones } from "@/test/doubles/contacts-native-double";
import { reportedScenarios } from "@/test/doubles/native-doubles";
import { mswServer } from "@/test/mock-bank/mock-bank";
import { renderRoute } from "@/test/render/render-route";
import {
  findAccessibleGroupAround,
  scenarioTest,
} from "@/test/render/drive-app";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/flow-store/flow-store";

import { UNKNOWN_BANK_CODE } from "./TransferRecipientScreen.helper";

it.each(["012-345 6789", "60123456789", "+60 12 345 6789"])(
  "takes %s as a DuitNow mobile number and moves on to the amount",
  async (typedMobile) => {
    const view = await renderRoute("/");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Transfer", disabled: false }),
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
  [
    "Account number",
    "Account number",
    "1234567",
    "Enter the account number: 8 to 17 digits.",
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
      expect(reportedScenarios()).toContain("transfer.badly_formed_input");
    })(),
);

it(
  "drops what was wrong with a badly formed ID once it is fixed, and moves on",
  scenarioTest("transfer.badly_formed_input", async () => {
    const formatMessage = "Enter a Malaysian mobile number, like 012-345 6789.";
    const view = await renderRoute("/transfer");
    const mobileField = await screen.findByLabelText("DuitNow mobile number");
    await fireEvent.changeText(mobileField, "03-2345 6789");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByHintText(formatMessage)).toBeOnTheScreen();

    await fireEvent.changeText(mobileField, "012-345 6789");
    expect(screen.queryByHintText(formatMessage)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(view.getPathname()).toBe("/transfer/amount");
  }),
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

it("brings the keyboard back with the new ID's keys when the chip changes while the ID is being typed", async () => {
  await renderRoute("/transfer");
  const mobileField = await screen.findByLabelText("DuitNow mobile number");
  await fireEvent(mobileField, "focus");

  await fireEvent.press(screen.getByRole("radio", { name: "Passport" }));

  // Jest has no keyboard: a new field asking for focus is the nearest thing it can see.
  const passportField = screen.getByLabelText("Passport number");
  expect(passportField).not.toBe(mobileField);
  expect(passportField).toHaveProp("autoFocus", true);
  expect(passportField).toHaveProp("autoCapitalize", "characters");
});

it("raises no keyboard when the chip changes after the ID stopped being typed", async () => {
  await renderRoute("/transfer");
  const mobileField = await screen.findByLabelText("DuitNow mobile number");
  await fireEvent(mobileField, "focus");
  await fireEvent(mobileField, "blur");

  await fireEvent.press(screen.getByRole("radio", { name: "Passport" }));

  expect(screen.getByLabelText("Passport number")).not.toHaveProp(
    "autoFocus",
    true,
  );
});

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

it("says something unexpected went wrong in the bank sheet when the banks cannot load, and lists them on Try again", async () => {
  mswServer.use(
    http.get("*/banks", () =>
      HttpResponse.json(UNKNOWN_BANK_CODE, { status: 400 }),
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  const tryAgain = await screen.findByRole("button", { name: "Try again" });
  const banksUnexpected = screen.getByText("Something unexpected went wrong.");

  mswServer.resetHandlers();
  await fireEvent.press(tryAgain);

  expect(
    await screen.findByRole("button", { name: "Public Bank" }),
  ).toBeOnTheScreen();
  expect(banksUnexpected).not.toBeOnTheScreen();
});

it("reports only the session's end, and says no failure, for banks that failed into it with the bank sheet open, listing them once signed in again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  let answerBanks: (response: Response) => void = () => undefined;
  mswServer.use(
    http.get(
      "*/banks",
      () =>
        new Promise<Response>((resolve) => {
          answerBanks = resolve;
        }),
      { once: true },
    ),
  );
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Account number" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Bank" }));
  await screen.findByLabelText("Search banks");
  const reportsBeforeTheSessionEnded = reportedScenarios().length;

  answerBanks(new HttpResponse(null, { status: 401 }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Sign in again" }),
  );

  expect(
    await screen.findByRole("button", { name: "Public Bank" }),
  ).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTimeAsync(1_000));
  expect(reportedScenarios().slice(reportsBeforeTheSessionEnded)).toEqual([
    "transfer.session_ended",
  ]);
  expect(announce).not.toHaveBeenCalledWith("Something unexpected went wrong.");
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
    await screen.findByRole("button", { name: "Transfer", disabled: false }),
  );

  const mobileField = await screen.findByLabelText("DuitNow mobile number");
  expect(mobileField).toHaveDisplayValue("");
  await fireEvent.changeText(mobileField, "012-345 6789");
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByLabelText("Amount (RM)")).toHaveDisplayValue("");
  expect(view.getPathname()).toBe("/transfer/amount");
});

it("tells a screen reader that the recipient step's recent recipients, ID types, bank field and banks are in Bahasa Malaysia when the app opens with it picked", async () => {
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer");
  const [firstRecent] = await screen.findAllByRole("button", { name: /••••/ });
  expect(firstRecent).toHaveProp("accessibilityLanguage", "ms-MY");
  const accountNumberChip = screen.getByRole("radio", {
    name: malayTransferT("chip_id_type.id_type.account_number"),
  });
  expect(accountNumberChip).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(accountNumberChip);
  const bankField = screen.getByRole("button", {
    name: malayTransferT("field_bank.label"),
  });
  expect(bankField).toHaveProp("accessibilityLanguage", "ms-MY");
  await fireEvent.press(bankField);

  expect(await screen.findByRole("button", { name: "Maybank" })).toHaveProp(
    "accessibilityLanguage",
    "ms-MY",
  );
});

it("tells a screen reader that a contact's numbers are in Bahasa Malaysia when the app opens with it picked", async () => {
  setPickedContactPhones([
    { id: "phone-1", label: "mobile", number: "012-345 6789" },
    { id: "phone-2", label: "home", number: "+60 19-876 5432" },
  ]);
  pickAppLanguage(AppLanguage.Malay);
  await renderRoute("/transfer");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: malayTransferT("button_contacts.label"),
    }),
  );

  expect(
    findAccessibleGroupAround(await screen.findByText("+60 19-876 5432")),
  ).toHaveProp("accessibilityLanguage", "ms-MY");
});
const malayTransferT = getFixedT(AppLanguage.Malay, "transfer");
