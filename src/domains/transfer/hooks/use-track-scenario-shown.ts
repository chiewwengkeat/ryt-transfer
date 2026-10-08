import { useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";

import { trackEvent } from "@/shared/observability/observability";

// For a scenario a screen shows by itself: the transfer store reports its own with the step it moves to.
export function trackScenarioShown(scenario: string) {
  trackEvent("transfer_step", { scenario });
}

export function useTrackScenarioShown(scenario: string | undefined) {
  const screenFocused = useIsFocused();
  const reportedScenarioRef = useRef<string>(undefined);
  // Only on top: a covered screen stays mounted, and a 401 fails its reads too. Once per showing, so a return is not another.
  useEffect(() => {
    if (scenario === undefined) reportedScenarioRef.current = undefined;
    else if (screenFocused && reportedScenarioRef.current !== scenario) {
      reportedScenarioRef.current = scenario;
      trackScenarioShown(scenario);
    }
  }, [scenario, screenFocused]);
}
