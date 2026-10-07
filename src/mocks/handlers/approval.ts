import { http } from "msw";

import { registerBankApprovalKeys } from "@/mocks/bank/approval-keys";

import { answerBankWrite } from "./answer-from-bank";
import { BANK_PATHS } from "./bank-paths";

export const approvalHandlers = [
  http.post(BANK_PATHS.approvalKeys, ({ request }) =>
    answerBankWrite(request, registerBankApprovalKeys),
  ),
];
