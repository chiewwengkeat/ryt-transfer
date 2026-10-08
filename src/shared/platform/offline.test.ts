import { act, renderHook } from "@testing-library/react-native";

import { TransportErrorKind } from "@/shared/http/transport-error";
import { setPhoneNetwork } from "@/test/harness/native-doubles";
import { observedRecords } from "@/test/harness/recording-sink";

import {
  addBankReachedAgainListener,
  reportRequestOutcome,
  useIsOffline,
} from "./offline";

const NO_CONNECTION = { isConnected: false, isInternetReachable: false };
const CONNECTED = { isConnected: true, isInternetReachable: true };

it("reads online while the phone has a connection and requests reach the bank", async () => {
  const { result } = await renderHook(useIsOffline);

  expect(result.current).toBe(false);
});

it("is offline while the phone reports no connection", async () => {
  const { result } = await renderHook(useIsOffline);

  await act(() => {
    setPhoneNetwork(NO_CONNECTION);
  });
  const offlineWhileDisconnected = result.current;
  await act(() => {
    setPhoneNetwork(CONNECTED);
  });

  expect(offlineWhileDisconnected).toBe(true);
  expect(result.current).toBe(false);
});

it("is offline once a request finds no network, and stays so through a timeout and an abort", async () => {
  const { result } = await renderHook(useIsOffline);

  await act(() => {
    reportRequestOutcome(TransportErrorKind.Network);
    reportRequestOutcome(TransportErrorKind.Timeout);
    reportRequestOutcome(TransportErrorKind.Aborted);
  });

  expect(result.current).toBe(true);
});

it.each([
  ["an answer", undefined],
  ["an error status", TransportErrorKind.Http],
  ["an answer it cannot read", TransportErrorKind.Unreadable],
])(
  "is back online once a request gets %s from the bank",
  async (_, outcome) => {
    const { result } = await renderHook(useIsOffline);
    await act(() => {
      reportRequestOutcome(TransportErrorKind.Network);
    });

    await act(() => {
      reportRequestOutcome(outcome);
    });

    expect(result.current).toBe(false);
  },
);

it("stays online through a timeout and an abort", async () => {
  const { result } = await renderHook(useIsOffline);

  await act(() => {
    reportRequestOutcome(TransportErrorKind.Timeout);
    reportRequestOutcome(TransportErrorKind.Aborted);
  });

  expect(result.current).toBe(false);
});

it("stays offline while the phone reports no connection, whatever a request gets", async () => {
  const { result } = await renderHook(useIsOffline);
  await act(() => {
    setPhoneNetwork(NO_CONNECTION);
  });

  await act(() => {
    reportRequestOutcome();
  });

  expect(result.current).toBe(true);
});

it("opens the next reader online when the connection came back while nobody was reading it", async () => {
  const { unmount } = await renderHook(useIsOffline);
  await act(() => {
    setPhoneNetwork(NO_CONNECTION);
  });
  await unmount();
  setPhoneNetwork(CONNECTED);

  const readings: boolean[] = [];
  await renderHook(() => {
    readings.push(useIsOffline());
  });

  expect(readings).not.toContain(true);
});

it("reports a listener that throws once a request reaches the bank again, and still runs the rest, rather than fail that request", () => {
  const listenerAfterTheFailingOne = jest.fn();
  const stopFailingListener = addBankReachedAgainListener(() => {
    throw new TypeError("undefined is not a function");
  });
  const stopListenerAfterTheFailingOne = addBankReachedAgainListener(
    listenerAfterTheFailingOne,
  );
  reportRequestOutcome(TransportErrorKind.Network);

  reportRequestOutcome();
  stopFailingListener();
  stopListenerAfterTheFailingOne();

  expect(listenerAfterTheFailingOne).toHaveBeenCalledTimes(1);
  expect(observedRecords).toContainEqual({
    type: "error",
    name: "TypeError",
    properties: { boundary: "bank_reached_again_listener" },
  });
});
