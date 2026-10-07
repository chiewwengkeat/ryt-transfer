import {
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import {
  pairTestPhone,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

afterEach(() => {
  jest.restoreAllMocks();
});

const listPage = (cursor?: string | null) =>
  sendToBank<ListTransfersResponse>(
    "GET",
    cursor ? `/transfers?cursor=${encodeURIComponent(cursor)}` : "/transfers",
  );

async function wholeHistory() {
  const first = await listPage();
  const second = await listPage(first.body.nextCursor);
  return { first: first.body, second: second.body };
}

it("pages history newest first, thirty at a time, with no gap or repeat", async () => {
  const { first, second } = await wholeHistory();
  const items = [...first.items, ...second.items];
  const createdTimes = items.map(({ createdAt }) => Date.parse(createdAt));

  expect([first.items.length, second.items.length]).toEqual([30, 15]);
  expect(second.nextCursor).toBeNull();
  expect(new Set(items.map(({ transferId }) => transferId)).size).toBe(45);
  expect(createdTimes).toEqual(
    [...createdTimes].sort((left, right) => right - left),
  );
});

it("totals every day a page touches over that whole day, the next page's rows included", async () => {
  const { first, second } = await wholeHistory();
  const items = [...first.items, ...second.items];
  const moved = ({ funds, amount }: Transfer) =>
    funds === TransferFunds.Credited
      ? amount.minor
      : funds === TransferFunds.Debited || funds === TransferFunds.RefundPending
        ? -amount.minor
        : 0;

  const expectedDays = [
    ...new Set(first.items.map(({ createdAt }) => createdAt.slice(0, 10))),
  ].map((date) => {
    const sameDay = items.filter(({ createdAt }) => createdAt.startsWith(date));
    return {
      date,
      count: sameDay.length,
      net: {
        minor: sameDay.reduce((sum, transfer) => sum + moved(transfer), 0),
        currency: "MYR",
      },
    };
  });

  expect(first.days).toEqual(expectedDays);
  expect(first.days.at(-1)?.count).toBeGreaterThan(
    first.items.filter(({ createdAt }) =>
      createdAt.startsWith(first.days.at(-1)?.date ?? "-"),
    ).length,
  );
});

it.each([
  ["text that is not encoded JSON", "not-a-cursor"],
  ["JSON that is not a position", btoa("null")],
])("refuses a cursor it never issued: %s", async (_, cursor) => {
  const refused = await sendToBank<BankErrorBody>(
    "GET",
    `/transfers?cursor=${encodeURIComponent(cursor)}`,
  );

  expect([refused.status, refused.body.error.code]).toEqual([
    400,
    "INVALID_REQUEST",
  ]);
});

it("lists an approved transfer first, and never one left to expire", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const approved = await startTestTransfer(2_550);
  await sendToBank("POST", approved.approvalPath, {
    body: signTestApproval(approved, {
      kind: "biometric",
      keyId: biometricKeyId,
    }),
  });
  const abandoned = await startTestTransfer(1_000);
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);

  const { body } = await listPage();

  expect(body.items[0]).toMatchObject({
    transferId: approved.created.transfer.transferId,
    status: TransferStatus.Completed,
  });
  expect(body.items.map(({ transferId }) => transferId)).not.toContain(
    abandoned.created.transfer.transferId,
  );
});
