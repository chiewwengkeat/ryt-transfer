import { toMalaysianDateKey } from "@/shared/lib/dates/dates";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useMalaysianToday() {
  const [malaysianToday, setMalaysianToday] = useState(() => new Date());
  useEffect(() => {
    const showTodayIfTheDateMoved = () => {
      const now = new Date();
      setMalaysianToday((shown) =>
        toMalaysianDateKey(shown.toISOString()) ===
        toMalaysianDateKey(now.toISOString())
          ? shown
          : now,
      );
    };
    let midnightTimer: ReturnType<typeof setTimeout> | undefined;
    const waitForMalaysianMidnight = () => {
      const tomorrow = toMalaysianDateKey(
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      );
      midnightTimer = setTimeout(
        () => {
          showTodayIfTheDateMoved();
          waitForMalaysianMidnight();
        },
        Date.parse(`${tomorrow}T00:00:00+08:00`) - Date.now(),
      );
    };
    waitForMalaysianMidnight();
    // A suspended app's timers stop, so midnight can pass unseen until it comes back.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") showTodayIfTheDateMoved();
    });
    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);
  return malaysianToday;
}
