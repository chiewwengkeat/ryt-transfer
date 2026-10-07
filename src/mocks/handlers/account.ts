import { http } from "msw";

import {
  getBankPrimaryAccount,
  getBankTransferLimits,
} from "@/mocks/bank/account";

import { answerBankRead } from "./answer-from-bank";
import { BANK_PATHS } from "./bank-paths";

export const accountHandlers = [
  http.get(BANK_PATHS.primaryAccount, ({ request }) =>
    answerBankRead(request, getBankPrimaryAccount),
  ),
  http.get(BANK_PATHS.transferLimits, ({ request }) =>
    answerBankRead(request, getBankTransferLimits),
  ),
];
