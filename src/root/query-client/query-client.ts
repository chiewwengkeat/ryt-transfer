import {
  focusManager,
  onlineManager,
  type Query,
  QueryClient,
} from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { subscribeToPhoneConnection } from "@/shared/platform/network/network";
import { addBankReachedAgainListener } from "@/shared/platform/offline/offline";

onlineManager.setEventListener(subscribeToPhoneConnection);
focusManager.setEventListener((setFocused) => {
  // Runs again on Android's reopen after Back: focus is still off from that background, and active may come first.
  let backgroundSinceActive = !focusManager.isFocused();
  const followAppState = (state: AppStateStatus) => {
    if (state === "background") {
      backgroundSinceActive = true;
      setFocused(false);
    }
    // Never on "inactive": a face or fingerprint prompt passes through it, and must refetch nothing.
    if (state === "active" && backgroundSinceActive) {
      backgroundSinceActive = false;
      setFocused(true);
    }
  };
  if (AppState.currentState === "active") followAppState("active");
  const subscription = AppState.addEventListener("change", followAppState);
  return () => {
    subscription.remove();
  };
});

export function createQueryClient() {
  const client = new QueryClient({
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
  // React Query re-reads on the phone's reconnect, which never comes when only requests found no network.
  // Once per answer: a read that still finds none would turn offline back on after every request that gets through.
  const answersWhenLastReadAgain = new WeakMap<Query, number>();
  addBankReachedAgainListener(() => {
    const readsThatFoundNoNetwork = client.getQueryCache().findAll({
      type: "active",
      predicate: (query) =>
        query.state.error instanceof TransportError &&
        query.state.error.kind === TransportErrorKind.Network &&
        answersWhenLastReadAgain.get(query) !== query.state.dataUpdateCount,
    });
    for (const query of readsThatFoundNoNetwork) {
      answersWhenLastReadAgain.set(query, query.state.dataUpdateCount);
      // Through a reading observer: the query holds the options of whichever rendered last, a disabled one's retries too.
      void query.observers
        .find((observer) => observer.options.enabled !== false)
        // The read in flight may be the one that got through: let it land rather than send it again.
        ?.refetch({ cancelRefetch: false });
    }
  });
  return client;
}

export const queryClient = createQueryClient();
