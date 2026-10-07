import { useSyncExternalStore } from "react";

import { TransportErrorKind } from "@/shared/http/transport-error";

import { subscribeToPhoneConnection } from "./network";

let phoneConnected = true;
let lastRequestFoundNoNetwork = false;
const offlineListeners = new Set<() => void>();
let stopReadingPhoneConnection = () => {};

function subscribeToOfflineChanges(onChange: () => void) {
  offlineListeners.add(onChange);
  if (offlineListeners.size === 1)
    stopReadingPhoneConnection = subscribeToPhoneConnection((connected) => {
      phoneConnected = connected;
      for (const listener of offlineListeners) listener();
    });
  return () => {
    offlineListeners.delete(onChange);
    if (offlineListeners.size > 0) return;
    stopReadingPhoneConnection();
    // Nobody keeps this reading fresh now: the next reader must not open on a stale "no connection".
    phoneConnected = true;
  };
}

export function useIsOffline() {
  return useSyncExternalStore(
    subscribeToOfflineChanges,
    () => !phoneConnected || lastRequestFoundNoNetwork,
  );
}

export function reportRequestOutcome(failure?: TransportErrorKind) {
  // Neither says the connection is down: the bank may only be slow, and an abort is the app's own.
  if (
    failure === TransportErrorKind.Timeout ||
    failure === TransportErrorKind.Aborted
  )
    return;
  const foundNoNetwork = failure === TransportErrorKind.Network;
  if (foundNoNetwork === lastRequestFoundNoNetwork) return;
  lastRequestFoundNoNetwork = foundNoNetwork;
  for (const listener of offlineListeners) listener();
}
