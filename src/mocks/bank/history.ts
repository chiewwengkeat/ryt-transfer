import {
  GetTransferErrorCode,
  TransferFunds,
  TransferStatus,
  type GetTransferErrorResponse,
  type GetTransferResponse,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  ListTransfersErrorCode,
  type ListTransfersErrorResponse,
  type ListTransfersResponse,
} from "@/domains/transfer/api/list-transfers/list-transfers.type";

import { bankError, wireMoney, type BankAnswer } from "./answers";
import { bankTransfersWithSeededHistory } from "./state";

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// The one order for history: its pages sort by it and its cursors compare by it.
function compareNewestFirst(
  [leftMs, leftId]: [number, string],
  [rightMs, rightId]: [number, string],
) {
  if (leftMs !== rightMs) return rightMs - leftMs;
  if (leftId === rightId) return 0;
  return leftId < rightId ? 1 : -1;
}

export function bankTransfersNewestFirst() {
  return bankTransfersWithSeededHistory().sort((left, right) =>
    compareNewestFirst(
      [left.createdAtMs, left.transfer.transferId],
      [right.createdAtMs, right.transfer.transferId],
    ),
  );
}

export function getBankTransfer(
  transferId: string,
): BankAnswer<GetTransferResponse | GetTransferErrorResponse> {
  const record = bankTransfersNewestFirst().find(
    ({ transfer }) => transfer.transferId === transferId,
  );
  return record
    ? { status: 200, body: { transfer: record.transfer } }
    : bankError(
        404,
        GetTransferErrorCode.TransferNotFound,
        "No transfer has this id.",
      );
}

// Money that actually moved: a pending refund has not come back yet, so it still counts.
function movedMinor(transfer: Transfer) {
  switch (transfer.funds) {
    case TransferFunds.Debited:
    case TransferFunds.RefundPending:
      return -transfer.amount.minor;
    case TransferFunds.Credited:
      return transfer.amount.minor;
    case TransferFunds.NotDebited:
    case TransferFunds.Refunded:
      return 0;
  }
}

export function listBankTransfers(
  query: URLSearchParams,
): BankAnswer<ListTransfersResponse | ListTransfersErrorResponse> {
  const invalid = (message: string) =>
    bankError(400, ListTransfersErrorCode.InvalidRequest, message);
  const limit = Number(query.get("limit") ?? PAGE_SIZE);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return invalid(`limit is a whole number from 1 to ${MAX_PAGE_SIZE}.`);
  }
  let after: [number, string] | undefined;
  const cursor = query.get("cursor");
  if (cursor !== null) {
    try {
      after = JSON.parse(atob(cursor)) as [number, string];
    } catch {
      return invalid("This cursor did not come from this list.");
    }
    if (
      !Array.isArray(after) ||
      typeof after[0] !== "number" ||
      typeof after[1] !== "string"
    ) {
      return invalid("This cursor did not come from this list.");
    }
  }

  const listed = bankTransfersNewestFirst().filter(
    ({ transfer }) =>
      transfer.status !== TransferStatus.AwaitingApproval &&
      transfer.status !== TransferStatus.Expired,
  );
  const start = after
    ? listed.findIndex(
        ({ createdAtMs, transfer }) =>
          compareNewestFirst([createdAtMs, transfer.transferId], after) > 0,
      )
    : 0;
  const page = start === -1 ? [] : listed.slice(start, start + limit);
  const last = page.at(-1);
  const hasMore = start !== -1 && start + limit < listed.length;

  // createdAt carries +08:00, so its first ten characters are the Malaysian date.
  const dayOf = (transfer: Transfer) => transfer.createdAt.slice(0, 10);
  const pageDays = new Set(page.map(({ transfer }) => dayOf(transfer)));
  const days = new Map<string, { count: number; netMinor: number }>();
  for (const { transfer } of listed) {
    const date = dayOf(transfer);
    if (!pageDays.has(date)) continue;
    const day = days.get(date) ?? { count: 0, netMinor: 0 };
    days.set(date, {
      count: day.count + 1,
      netMinor: day.netMinor + movedMinor(transfer),
    });
  }

  return {
    status: 200,
    body: {
      items: page.map(({ transfer }) => transfer),
      nextCursor:
        hasMore && last
          ? btoa(JSON.stringify([last.createdAtMs, last.transfer.transferId]))
          : null,
      days: [...days].map(([date, { count, netMinor }]) => ({
        date,
        count,
        net: wireMoney(netMinor),
      })),
    },
  };
}
