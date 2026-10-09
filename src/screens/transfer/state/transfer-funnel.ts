import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { trackEvent } from "@/shared/observability/observability";

import {
  TransferFlowScenario,
  type TransferFlowState,
  TransferHoldKind,
} from "./transfer-flow.type";

let scenarioReportsHeld = false;
let flowReachedWhileReportsHeld: TransferFlowState | undefined;

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
  if (scenarioReportsHeld && scenario !== undefined) {
    flowReachedWhileReportsHeld = nextFlow;
    return;
  }
  trackTransferStep(nextFlow, scenario);
}

export function holdTransferScenarioReports() {
  scenarioReportsHeld = true;
}

// Reports the held scenario only if the flow still shows it; with no flow, as the root goes away, nothing shows.
export function releaseTransferScenarioReports(
  flowShownNow?: TransferFlowState,
) {
  const flowReached = flowReachedWhileReportsHeld;
  scenarioReportsHeld = false;
  flowReachedWhileReportsHeld = undefined;
  if (flowReached !== undefined && flowReached === flowShownNow)
    trackTransferStep(flowReached, findScenarioTheFlowShows(flowReached));
}

function trackTransferStep(
  flow: TransferFlowState,
  scenario: TransferFlowScenario | undefined,
) {
  trackEvent("transfer_step", {
    step: flow.step,
    ...("draft" in flow && {
      amountMinor: flow.draft.amount?.minor,
      currency: flow.draft.amount?.currency,
    }),
    ...("path" in flow && { path: flow.path }),
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
