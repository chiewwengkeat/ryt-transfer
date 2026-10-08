import { trackEvent } from "@/shared/observability/observability";

import type { transferFlowStore } from "./transfer-flow";

export function trackTransferStepAndAmount(
  flow: ReturnType<typeof transferFlowStore.getState>,
) {
  trackEvent("transfer_step", {
    step: flow.step,
    ...("draft" in flow && {
      amountMinor: flow.draft.amount?.minor,
      currency: flow.draft.amount?.currency,
    }),
  });
}
