import { useEffect } from "react";

import { trackEvent } from "@/shared/observability/observability";

// For a scenario a screen shows by itself: the transfer store reports its own with the step it moves to.
export function trackScenarioShown(scenario: string) {
  trackEvent("transfer_step", { scenario });
}

export function useTrackScenarioShown(scenario: string | undefined) {
  useEffect(() => {
    if (scenario !== undefined) trackScenarioShown(scenario);
  }, [scenario]);
}
