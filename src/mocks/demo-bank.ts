import type { RequestHandler } from "msw";

import { DEMO_PIN_ATTEMPTS } from "./bank/seed";
import { bankState, persistBankState, resetBankState } from "./bank/state";
import { accountHandlers } from "./handlers/account";
import { approvalHandlers } from "./handlers/approval";
import { transferHandlers } from "./handlers/transfer";

const bankHandlers = [
  ...accountHandlers,
  ...transferHandlers,
  ...approvalHandlers,
];

export function handlersForActiveScenario(): RequestHandler[] {
  return [...bankHandlers];
}

export function resetDemoBank(): Promise<void> {
  resetBankState();
  return Promise.resolve();
}

export function unlockDemoPin() {
  bankState().pinAttemptsRemaining = DEMO_PIN_ATTEMPTS;
  persistBankState();
}

export function demoBankNotifications() {
  return [...bankState().notifications];
}
