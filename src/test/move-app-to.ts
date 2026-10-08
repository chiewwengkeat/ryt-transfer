import {
  AppState,
  type AppStateStatus,
  type NativeEventSubscription,
} from "react-native";

// ⛔ Skip removed listeners: the double's remove() does nothing, so replaying them hides a listener the app dropped.
export function moveAppTo(state: AppStateStatus) {
  const { calls, results } = jest.mocked(AppState).addEventListener.mock;
  calls.forEach(([eventName, listener], index) => {
    const subscription = results[index]?.value as NativeEventSubscription;
    if (
      eventName === "change" &&
      jest.mocked(subscription).remove.mock.calls.length === 0
    )
      listener(state);
  });
}
