import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  lookUpTestRecipient,
  sendToBank,
  type BankErrorBody,
} from "@/test/bank-client";

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
