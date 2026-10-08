import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { trackEvent } from "@/shared/observability/observability";

import {
  TransferFlowScenario,
  type TransferFlowState,
  TransferHoldKind,
} from "./transfer-flow.type";

export function trackTransferStepOrScenarioChange(
  flow: TransferFlowState,
  nextFlow: TransferFlowState,
) {
  const scenario = findScenarioTheFlowShows(nextFlow);
  if (
    nextFlow.step === flow.step &&
    (scenario === undefined || scenario === findScenarioTheFlowShows(flow))
  )
    return;
  trackEvent("transfer_step", {
    step: nextFlow.step,
    ...("draft" in nextFlow && {
      amountMinor: nextFlow.draft.amount?.minor,
      currency: nextFlow.draft.amount?.currency,
    }),
    ...("path" in nextFlow && { path: nextFlow.path }),
    scenario,
  });
}

function findScenarioTheFlowShows(flow: TransferFlowState) {
  if ("notice" in flow && flow.notice !== undefined) return flow.notice;
  if (!("hold" in flow) || flow.hold === undefined) return undefined;
  if (flow.hold.kind === TransferHoldKind.AccountLocked)
    return TransferFlowScenario.AccountLocked;
  return flow.hold.reason === CoolingOffReason.NewAccount
    ? TransferFlowScenario.CoolingOffNewAccount
    : TransferFlowScenario.CoolingOffNewPhone;
}
