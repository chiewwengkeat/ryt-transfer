import { TransportErrorKind } from "@/shared/http/transport-error/transport-error";
import { reportError } from "@/shared/observability/observability/observability";
import { subscribeToPhoneConnection } from "@/shared/platform/network/network";
import { useSyncExternalStore } from "react";

export function useIsOffline() {
  return useSyncExternalStore(
    subscribeToOfflineChanges,
    () => !isPhoneConnected || didLastRequestFindNoNetwork,
  );
}

// Reads pause on the phone's own report alone, so this, not useIsOffline, says whether a retry can send.
export function usePhoneReportsConnection() {
  return useSyncExternalStore(
    subscribeToOfflineChanges,
    () => isPhoneConnected,
  );
}

export function reportRequestOutcome(
  request: string,
  failure?: TransportErrorKind,
) {
  // Neither says the connection is down: the server may only be slow, and an abort is the app's own.
  if (
    failure === TransportErrorKind.Timeout ||
    failure === TransportErrorKind.Aborted
  )
    return;
  const didFindNoNetwork = failure === TransportErrorKind.Network;
  if (didFindNoNetwork) {
    // Its answer is lost while others' arrive: the trouble is this request's, and counting it would flap offline.
    if (requestsLostWhileTheServerAnswersOthers.has(request)) return;
    requestsFindingNoNetworkSinceTheServerAnswered.add(request);
  } else {
    requestsLostWhileTheServerAnswersOthers.delete(request);
    requestsFindingNoNetworkSinceTheServerAnswered.delete(request);
    for (const lostRequest of requestsFindingNoNetworkSinceTheServerAnswered)
      requestsLostWhileTheServerAnswersOthers.add(lostRequest);
    requestsFindingNoNetworkSinceTheServerAnswered.clear();
  }
  if (didFindNoNetwork === didLastRequestFindNoNetwork) return;
  didLastRequestFindNoNetwork = didFindNoNetwork;
  for (const listener of offlineListeners) listener();
  if (didFindNoNetwork) return;
  for (const listener of serverReachedAgainListeners) {
    try {
      listener();
    } catch (listenerFailure) {
      // Reported, not thrown: this runs inside the request that got through, whose caller is owed the server's answer.
      reportError(listenerFailure, {
        boundary: "server_reached_again_listener",
      });
    }
  }
}

export function forgetRequestOutcomes() {
  didLastRequestFindNoNetwork = false;
  requestsFindingNoNetworkSinceTheServerAnswered.clear();
  requestsLostWhileTheServerAnswersOthers.clear();
}

export function addServerReachedAgainListener(listener: () => void) {
  serverReachedAgainListeners.add(listener);
  return () => {
    serverReachedAgainListeners.delete(listener);
  };
}

let isPhoneConnected = true;
let didLastRequestFindNoNetwork = false;
const requestsFindingNoNetworkSinceTheServerAnswered = new Set<string>();
const requestsLostWhileTheServerAnswersOthers = new Set<string>();
const offlineListeners = new Set<() => void>();
const serverReachedAgainListeners = new Set<() => void>();
let stopReadingPhoneConnection = () => {};

function subscribeToOfflineChanges(onChange: () => void) {
  offlineListeners.add(onChange);
  if (offlineListeners.size === 1)
    stopReadingPhoneConnection = subscribeToPhoneConnection((isConnected) => {
      isPhoneConnected = isConnected;
      for (const listener of offlineListeners) listener();
    });
  return () => {
    offlineListeners.delete(onChange);
    if (offlineListeners.size > 0) return;
    stopReadingPhoneConnection();
    // Nobody keeps this reading fresh now: the next reader must not open on a stale "no connection".
    isPhoneConnected = true;
  };
}
