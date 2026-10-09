import { http, HttpResponse } from "msw";

import type {
  GetTransferResponse,
  Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { BANK_PATHS } from "@/mocks/handlers/bank-paths/bank-paths";

import { mswServer } from "@/test/mock-bank/msw-server";

// Any other transfer goes on to the bank, which knows none of these fixtures and answers 404.
export function serveTransferDetails(transfer: Transfer) {
  mswServer.use(
    http.get(BANK_PATHS.transfer, ({ params }) =>
      params.transferId === transfer.transferId
        ? HttpResponse.json({ transfer } satisfies GetTransferResponse)
        : undefined,
    ),
  );
}

export function holdTransferDetails() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  mswServer.use(
    http.get(BANK_PATHS.transfer, async () => {
      await released;
    }),
  );
  return release;
}

export function failTransferDetails(status = 500) {
  let failing = true;
  mswServer.use(
    http.get(BANK_PATHS.transfer, () =>
      failing ? new HttpResponse(null, { status }) : undefined,
    ),
  );
  return () => {
    failing = false;
  };
}
