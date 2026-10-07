import {
  focusManager,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { AppState } from "react-native";

import { TransportError, TransportErrorKind } from "@/shared/http/transport";
import { subscribeToPhoneConnection } from "@/shared/platform/network";

onlineManager.setEventListener(subscribeToPhoneConnection);
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener("change", (state) => {
    setFocused(state === "active");
  });
  return () => {
    subscription.remove();
  };
});

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A timeout retries like a dropped connection: three tries, about 30 s at worst, before the error shows.
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
