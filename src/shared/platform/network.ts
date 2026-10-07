import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";

export function subscribeToPhoneConnection(
  onChange: (connected: boolean) => void,
) {
  let subscribed = true;
  let heardAChange = false;
  const subscription = addNetworkStateListener((state) => {
    heardAChange = true;
    onChange(isPhoneConnected(state));
  });
  // The first read can land after a change event, and must not overwrite the newer state.
  void getNetworkStateAsync().then((state) => {
    if (subscribed && !heardAChange) onChange(isPhoneConnected(state));
  });
  return () => {
    subscribed = false;
    subscription.remove();
  };
}

// Only a phone that says it has no connection is offline; no answer at all must not pause requests.
function isPhoneConnected(state: NetworkState) {
  return state.isConnected !== false;
}
