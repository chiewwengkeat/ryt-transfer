import { http, HttpResponse } from "msw";

import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { MONEY_MOVED_SIGN } from "@/domains/transfer/api/list-transfers/list-transfers";
import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { BANK_PATHS } from "@/mocks/handlers/bank-paths";

import { mswServer } from "./msw-server";

// One row unless a test serves others: a query by a row's text then matches that row alone.
beforeEach(() => {
  serveTransferHistoryPages([[buildHistoryTransfer()]]);
});

export function buildHistoryTransfer({
  registeredName = "Aisyah Rahman",
  ...overrides
}: Partial<Transfer> & { registeredName?: string } = {}) {
  return {
    transferId: `TRF-${registeredName.toUpperCase().replaceAll(" ", "-")}`,
    version: 1,
    direction: TransferDirection.Out,
    status: TransferStatus.Completed,
    funds: TransferFunds.Debited,
    counterparty: {
      registeredName,
      idType: RecipientIdType.Mobile,
      idValueMasked: "•••• 4321",
      bankName: "Ryt Bank",
    },
    amount: { minor: 5000, currency: "MYR" },
    createdAt: "2026-10-05T15:42:00+08:00",
    updatedAt: "2026-10-05T15:42:00+08:00",
    ...overrides,
  } satisfies Transfer;
}

// Each day's summary covers that day across every page, as the bank's do, so a split day reads whole from page 1.
export function serveTransferHistoryPages(pages: Transfer[][]) {
  // createdAt carries +08:00, so its first ten characters are the Malaysian date.
  const dateOf = (transfer: Transfer) => transfer.createdAt.slice(0, 10);
  serveTransferHistoryResponses(
    pages.map((items) => ({
      items,
      days: [...new Set(items.map(dateOf))].map((date) => {
        const dayTransfers = pages
          .flat()
          .filter((transfer) => dateOf(transfer) === date);
        return {
          date,
          count: dayTransfers.length,
          net: {
            minor: dayTransfers.reduce(
              (net, { funds, amount }) =>
                net + MONEY_MOVED_SIGN[funds] * amount.minor,
              0,
            ),
            currency: "MYR",
          },
        };
      }),
    })),
  );
}

// Each page's summaries exactly as given: a day can change between one page and the next.
export function serveTransferHistoryResponses(
  pages: Omit<ListTransfersResponse, "nextCursor">[],
) {
  mswServer.use(
    http.get(BANK_PATHS.transfers, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      const pageNumber =
        cursor === null ? 1 : Number(cursor.replace("page-", ""));
      return HttpResponse.json({
        items: [],
        days: [],
        ...pages[pageNumber - 1],
        nextCursor: pageNumber < pages.length ? `page-${pageNumber + 1}` : null,
      } satisfies ListTransfersResponse);
    }),
  );
}

// Held until the test releases them, then handed on to the handlers beneath this one.
export function holdTransferHistoryPages(pages: "first" | "later") {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  mswServer.use(
    http.get(BANK_PATHS.transfers, async ({ request }) => {
      if (isRequestForPages(request, pages)) await released;
    }),
  );
  return release;
}

// Answered with `status` until the test recovers them, then handed on to the handlers beneath this one.
export function failTransferHistoryPages(
  pages: "first" | "later",
  status = 500,
) {
  let failing = true;
  mswServer.use(
    http.get(BANK_PATHS.transfers, ({ request }) =>
      failing && isRequestForPages(request, pages)
        ? new HttpResponse(null, { status })
        : undefined,
    ),
  );
  return () => {
    failing = false;
  };
}

function isRequestForPages(request: Request, pages: "first" | "later") {
  return (
    new URL(request.url).searchParams.has("cursor") === (pages === "later")
  );
}
