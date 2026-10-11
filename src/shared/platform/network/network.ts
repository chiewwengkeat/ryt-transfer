import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";

export function subscribeToPhoneConnection(
  onChange: (connected: boolean) => void,
) {
  let isSubscribed = true;
  let changesHeard = 0;
  let nextReadTimer: ReturnType<typeof setTimeout> | undefined;

  function reportAndReadAgainIfDisconnected(state: NetworkState) {
    // Only a phone that says it has no connection is offline; no answer at all must not pause requests.
    const isConnected = state.isConnected !== false;
    clearTimeout(nextReadTimer);
    // A disconnection can end with no event to say so: read again until a reading says connected.
    if (!isConnected) nextReadTimer = setTimeout(readAndReport, 2_000);
    onChange(isConnected);
  }

  function readAndReport() {
    const changesHeardBeforeRead = changesHeard;
    // A read can land after a change event, and must not overwrite the newer state.
    void getNetworkStateAsync().then((state) => {
      if (isSubscribed && changesHeard === changesHeardBeforeRead)
        reportAndReadAgainIfDisconnected(state);
    });
  }

  const subscription = addNetworkStateListener((state) => {
    changesHeard += 1;
    reportAndReadAgainIfDisconnected(state);
  });
  readAndReport();
  return () => {
    isSubscribed = false;
    clearTimeout(nextReadTimer);
    subscription.remove();
  };
}
