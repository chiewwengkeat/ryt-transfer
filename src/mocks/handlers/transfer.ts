import { http } from "msw";

import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { getBankTransfer, listBankTransfers } from "@/mocks/bank/history";
import {
  listBankBanks,
  listBankRecentRecipients,
  lookupBankRecipient,
} from "@/mocks/bank/recipients";
import { approveBankTransfer } from "@/mocks/bank/transfer-approval";
import { createBankTransfer } from "@/mocks/bank/transfer-creation";

import { answerBankRead, answerBankWrite } from "./answer-from-bank";
import { BANK_PATHS } from "./bank-paths";

export const transferHandlers = [
  http.post(BANK_PATHS.recipientLookup, ({ request }) =>
    answerBankRead(request, lookupBankRecipient),
  ),
  http.get(BANK_PATHS.recentRecipients, ({ request }) =>
    answerBankRead(request, listBankRecentRecipients),
  ),
  http.get(BANK_PATHS.banks, ({ request }) =>
    answerBankRead(request, listBankBanks),
  ),
  http.post(BANK_PATHS.transfers, ({ request }) =>
    answerBankWrite(request, createBankTransfer, CreateTransferErrorCode),
  ),
  http.post<{ transferId: string }>(
    BANK_PATHS.transferApproval,
    ({ request, params }) =>
      answerBankWrite(
        request,
        (call) => approveBankTransfer(params.transferId, call),
        ApproveTransferErrorCode,
      ),
  ),
  http.get<{ transferId: string }>(BANK_PATHS.transfer, ({ request, params }) =>
    answerBankRead(request, () => getBankTransfer(params.transferId)),
  ),
  http.get(BANK_PATHS.transfers, ({ request }) =>
    answerBankRead(request, () =>
      listBankTransfers(new URL(request.url).searchParams),
    ),
  ),
];
