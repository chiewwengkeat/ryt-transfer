import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  lookUpTestRecipient,
  readBankBalanceMinor,
  readBankUsedTodayMinor,
  sendToBank,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

afterEach(() => {
  jest.restoreAllMocks();
});

it("creates a transfer awaiting approval and moves no money", async () => {
  const balanceBefore = await readBankBalanceMinor();

  const { created } = await startTestTransfer(2_550, { note: "Lunch" });

  expect(created).toMatchObject({
    transfer: {
      status: TransferStatus.AwaitingApproval,
      funds: TransferFunds.NotDebited,
      amount: { minor: 2_550, currency: "MYR" },
      note: "Lunch",
    },
    approval: { expiresInSeconds: 60 },
  });
  expect(await readBankBalanceMinor()).toBe(balanceBefore);
  expect(await readBankUsedTodayMinor()).toBe(0);
});

it.each([
  ["a note with symbols", { note: "Lunch!" }, "NOTE_INVALID"],
  ["an amount of zero", { minor: 0 }, "AMOUNT_INVALID"],
  ["an amount above RM50,000", { minor: 5_000_001 }, "ABOVE_PER_TRANSFER_MAX"],
  ["an amount above the balance", { minor: 1_300_000 }, "INSUFFICIENT_FUNDS"],
  ["an amount above today's limit", { minor: 600_000 }, "DAILY_LIMIT_EXCEEDED"],
])("refuses to create a transfer with %s", async (_, change, code) => {
  const lookup = await lookUpTestRecipient();

  const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: {
      recipientRef: lookup.recipientRef,
      amount: {
        minor: "minor" in change ? change.minor : 1_000,
        currency: "MYR",
      },
      ...("note" in change && { note: change.note }),
    },
  });

  expect([refused.status, refused.body.error.code]).toEqual([422, code]);
});

it.each(["__proto__", "constructor", "toString"])(
  "refuses a recipientRef named %s as a name check it never made",
  async (recipientRef) => {
    const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
      body: { recipientRef, amount: { minor: 1_000, currency: "MYR" } },
    });

    expect([refused.status, refused.body.error.code]).toEqual([
      422,
      "RECIPIENT_REF_EXPIRED",
    ]);
  },
);

it("refuses to create a transfer once the name check is ten minutes old", async () => {
  const lookup = await lookUpTestRecipient();
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 600_000);

  const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: {
      recipientRef: lookup.recipientRef,
      amount: { minor: 1_000, currency: "MYR" },
    },
  });

  expect([refused.status, refused.body.error.code]).toEqual([
    422,
    "RECIPIENT_REF_EXPIRED",
  ]);
});
