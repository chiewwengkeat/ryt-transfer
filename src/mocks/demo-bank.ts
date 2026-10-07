import type { RequestHandler } from "msw";

import { DEMO_PIN_ATTEMPTS } from "./bank/seed";
import {
  activeTransferScenario,
  bankState,
  persistBankState,
  resetBankState,
  saveScenarioPick,
} from "./bank/state";
import { accountHandlers } from "./handlers/account";
import { approvalHandlers } from "./handlers/approval";
import { transferHandlers } from "./handlers/transfer";
import type { TransferScenarioId } from "./scenarios/transfer-scenarios";
import { NO_SCENARIO_PICK } from "./switcher/switcher-store";

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

export function pickTransferScenario(scenarioId: TransferScenarioId) {
  saveScenarioPick({ scenarioId, activatedAtMs: Date.now() });
}

// "Normal, no scenario": the overlays stop and the bank keeps everything it holds.
export function clearTransferScenario() {
  saveScenarioPick(NO_SCENARIO_PICK);
}

export function unlockDemoPin() {
  bankState().pinAttemptsRemaining = DEMO_PIN_ATTEMPTS;
  persistBankState();
}

export function demoBankNotifications() {
  return [...bankState().notifications];
}
