import { useEffect, useRef } from "react";

import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top";
import { trackEvent } from "@/shared/observability/observability";

// For a scenario a screen shows by itself: the transfer store reports its own with the step it moves to.
export function trackScenarioShown(scenario: string) {
  trackEvent("transfer_step", { scenario });
}

export function useTrackScenarioShown(scenario: string | undefined) {
  const screenOnTop = useIsScreenOnTop();
  const reportedScenarioRef = useRef<string>(undefined);
  // Only on top: a covered screen stays mounted, and a 401 fails its reads too. Once per showing, so a return is not another.
  useEffect(() => {
    if (scenario === undefined) reportedScenarioRef.current = undefined;
    else if (screenOnTop && reportedScenarioRef.current !== scenario) {
      reportedScenarioRef.current = scenario;
      trackScenarioShown(scenario);
    }
  }, [scenario, screenOnTop]);
}
