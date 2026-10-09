import { http, type RequestHandler } from "msw";

import { RegisterApprovalKeysErrorCode } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  getBankPrimaryAccount,
  getBankTransferLimits,
} from "@/mocks/bank/account";
import { registerBankApprovalKeys } from "@/mocks/bank/approval-keys";
import { getBankTransfer, listBankTransfers } from "@/mocks/bank/history";
import {
  listBankRecentRecipients,
  listDuitNowBanks,
  lookupBankRecipient,
} from "@/mocks/bank/recipients";
import { approveBankTransfer } from "@/mocks/bank/transfer-approval";
import { createBankTransfer } from "@/mocks/bank/transfer-creation";

import { DEMO_PIN_ATTEMPTS } from "./bank/seed";
import {
  activeTransferScenario,
  bankState,
  persistBankState,
  resetBankState,
  saveScenarioPick,
} from "./bank/state";
import { answerBankRead, answerBankWrite } from "./handlers/answer-from-bank";
import { BANK_PATHS } from "./handlers/bank-paths";
import { NO_SCENARIO_PICK } from "./switcher/switcher-store";

const accountHandlers = [
  http.get(BANK_PATHS.primaryAccount, ({ request }) =>
    answerBankRead(request, getBankPrimaryAccount),
  ),
  http.get(BANK_PATHS.transferLimits, ({ request }) =>
    answerBankRead(request, getBankTransferLimits),
  ),
];

// Stays exported: the bundle check finds this name in demo builds, and minify keeps only an export's.
export const transferHandlers = [
  http.post(BANK_PATHS.recipientLookup, ({ request }) =>
    answerBankRead(request, lookupBankRecipient),
  ),
  http.get(BANK_PATHS.recentRecipients, ({ request }) =>
    answerBankRead(request, listBankRecentRecipients),
  ),
  http.get(BANK_PATHS.banks, ({ request }) =>
    answerBankRead(request, listDuitNowBanks),
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

const approvalHandlers = [
  http.post(BANK_PATHS.approvalKeys, ({ request }) =>
    answerBankWrite(
      request,
      registerBankApprovalKeys,
      RegisterApprovalKeysErrorCode,
    ),
  ),
];

const bankHandlers = [
  ...accountHandlers,
  ...transferHandlers,
  ...approvalHandlers,
];

export function handlersForActiveScenario(): RequestHandler[] {
  return [
    ...(activeTransferScenario()?.handlers?.(bankHandlers) ?? []),
    ...bankHandlers,
  ];
}

export function resetDemoBank(): Promise<void> {
  resetBankState();
  return Promise.resolve();
}

export function pickTransferScenario(scenarioId: `${TransferScenarioId}`) {
  saveScenarioPick({ scenarioId, activatedAtMs: Date.now() });
}

// "Normal, no scenario": the overlays stop and the bank keeps everything it holds.
export function clearTransferScenario() {
  saveScenarioPick(NO_SCENARIO_PICK);
}

export function isDemoPinLocked() {
  return bankState().pinAttemptsRemaining === 0;
}

export function unlockDemoPin() {
  bankState().pinAttemptsRemaining = DEMO_PIN_ATTEMPTS;
  persistBankState();
}

export function demoBankNotifications() {
  return [...bankState().notifications];
}
