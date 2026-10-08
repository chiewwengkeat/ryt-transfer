import {
  focusManager,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { AppState } from "react-native";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { subscribeToPhoneConnection } from "@/shared/platform/network";

onlineManager.setEventListener(subscribeToPhoneConnection);
focusManager.setEventListener((setFocused) => {
  let backgroundSinceActive = false;
  // Never on "inactive": a face or fingerprint prompt passes through it, and must refetch nothing.
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") {
      backgroundSinceActive = true;
      setFocused(false);
    }
    if (state === "active" && backgroundSinceActive) {
      backgroundSinceActive = false;
      setFocused(true);
    }
  });
  return () => {
    subscription.remove();
  };
});

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A timeout retries like a dropped connection: on a slow line, a second try often lands.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          error instanceof TransportError &&
          (error.kind === TransportErrorKind.Network ||
            error.kind === TransportErrorKind.Timeout ||
            (error.kind === TransportErrorKind.Http &&
              (error.status ?? 0) >= 500)),
      },
      // A write goes once, now: a retry, or a replay on reconnecting, could move money nobody approved again.
      mutations: { retry: 0, networkMode: "always" },
    },
  });
}

export const queryClient = createQueryClient();
