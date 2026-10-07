import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  lookUpTestRecipient,
  sendToBank,
  type BankErrorBody,
} from "@/test/bank-client";

afterEach(() => {
  jest.restoreAllMocks();
});

it("keeps a first answer for 24 hours and forgets it at 24 hours", async () => {
  const answeredAtMs = Date.parse("2026-10-08T10:00:00+08:00");
  const clock = jest.spyOn(Date, "now").mockReturnValue(answeredAtMs);
  const lookup = await lookUpTestRecipient();
  const createUnderOneKey = (minor: number) =>
    sendToBank<BankErrorBody>("POST", "/transfers", {
      body: {
        recipientRef: lookup.recipientRef,
        amount: { minor, currency: "MYR" },
      },
      idempotencyKey: "kept-a-day",
    });
  await createUnderOneKey(1_000);

  clock.mockReturnValue(answeredAtMs + 24 * 60 * 60 * 1000 - 1);
  const stillKept = await createUnderOneKey(2_000);
  clock.mockReturnValue(answeredAtMs + 24 * 60 * 60 * 1000);
  const forgotten = await createUnderOneKey(2_000);

  expect(stillKept.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  expect(forgotten.body.error.code).toBe("RECIPIENT_REF_EXPIRED");
});

it("refuses a write without an Idempotency-Key, and a key reused for another body", async () => {
  const lookup = await lookUpTestRecipient();
  const transfer = (minor: number) => ({
    recipientRef: lookup.recipientRef,
    amount: { minor, currency: "MYR" },
  });

  const unkeyed = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: transfer(1_000),
    idempotencyKey: null,
  });
  await sendToBank("POST", "/transfers", {
    body: transfer(1_000),
    idempotencyKey: "reused",
  });
  const reused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: transfer(2_000),
    idempotencyKey: "reused",
  });

  expect([unkeyed.status, unkeyed.body.error.code]).toEqual([
    400,
    "INVALID_REQUEST",
  ]);
  expect([reused.status, reused.body.error.code]).toEqual([
    409,
    "IDEMPOTENCY_KEY_REUSED",
  ]);
});

it("answers a repeated create with the first transfer rather than a second", async () => {
  const lookup = await lookUpTestRecipient();
  const body = {
    recipientRef: lookup.recipientRef,
    amount: { minor: 1_000, currency: "MYR" },
  };

  const first = await sendToBank<CreateTransferResponse>("POST", "/transfers", {
    body,
    idempotencyKey: "create-once",
  });
  const repeat = await sendToBank<CreateTransferResponse>(
    "POST",
    "/transfers",
    {
      body,
      idempotencyKey: "create-once",
    },
  );

  expect(repeat).toEqual(first);
});

it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
  "keeps the first answer under an Idempotency-Key named %s like any other",
  async (idempotencyKey) => {
    const lookup = await lookUpTestRecipient();
    const body = {
      recipientRef: lookup.recipientRef,
      amount: { minor: 1_000, currency: "MYR" },
    };

    const first = await sendToBank<CreateTransferResponse>(
      "POST",
      "/transfers",
      { body, idempotencyKey },
    );
    const repeat = await sendToBank<CreateTransferResponse>(
      "POST",
      "/transfers",
      { body, idempotencyKey },
    );

    expect(first.status).toBe(201);
    expect(repeat).toEqual(first);
  },
);
