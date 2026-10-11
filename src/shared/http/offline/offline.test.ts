import { act, renderHook } from "@testing-library/react-native";

import { TransportErrorKind } from "@/shared/http/transport-error/transport-error";
import {
  observedRecords,
  setPhoneNetwork,
} from "@/test/doubles/native-doubles";

import {
  addServerReachedAgainListener,
  reportRequestOutcome,
  useIsOffline,
} from "./offline";

it("reads online while the phone has a connection and requests reach the server", async () => {
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
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Timeout);
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Aborted);
  });

  expect(result.current).toBe(true);
});

it("stays online when a request loses its answer again after the server answered another", async () => {
  const { result } = await renderHook(useIsOffline);
  await act(() => {
    reportRequestOutcome(STATUS_READ, TransportErrorKind.Network);
    reportRequestOutcome(BALANCE_READ);
  });

  await act(() => {
    reportRequestOutcome(STATUS_READ, TransportErrorKind.Network);
  });

  expect(result.current).toBe(false);
});

it("is offline again when another request finds no network, or that request does once it has been answered", async () => {
  const { result } = await renderHook(useIsOffline);
  await act(() => {
    reportRequestOutcome(STATUS_READ, TransportErrorKind.Network);
    reportRequestOutcome(BALANCE_READ);
  });

  await act(() => {
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
  });
  const offlineWhenAnotherRequestFoundNone = result.current;
  await act(() => {
    reportRequestOutcome(STATUS_READ);
    reportRequestOutcome(STATUS_READ, TransportErrorKind.Network);
  });

  expect(offlineWhenAnotherRequestFoundNone).toBe(true);
  expect(result.current).toBe(true);
});

it.each([
  ["an answer", undefined],
  ["an error status", TransportErrorKind.Http],
  ["an answer it cannot read", TransportErrorKind.Unreadable],
])(
  "is back online once a request gets %s from the server",
  async (_, outcome) => {
    const { result } = await renderHook(useIsOffline);
    await act(() => {
      reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
    });

    await act(() => {
      reportRequestOutcome(BALANCE_READ, outcome);
    });

    expect(result.current).toBe(false);
  },
);

it("stays online through a timeout and an abort", async () => {
  const { result } = await renderHook(useIsOffline);

  await act(() => {
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Timeout);
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Aborted);
  });

  expect(result.current).toBe(false);
});

it("stays offline while the phone reports no connection, whatever a request gets", async () => {
  const { result } = await renderHook(useIsOffline);
  await act(() => {
    setPhoneNetwork(NO_CONNECTION);
  });

  await act(() => {
    reportRequestOutcome(BALANCE_READ);
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

it("reports a listener that throws once a request reaches the server again, and still runs the rest, rather than fail that request", () => {
  const listenerAfterTheFailingOne = jest.fn();
  const stopFailingListener = addServerReachedAgainListener(() => {
    throw new TypeError("undefined is not a function");
  });
  const stopListenerAfterTheFailingOne = addServerReachedAgainListener(
    listenerAfterTheFailingOne,
  );
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);

  reportRequestOutcome(BALANCE_READ);
  stopFailingListener();
  stopListenerAfterTheFailingOne();

  expect(listenerAfterTheFailingOne).toHaveBeenCalledTimes(1);
  expect(observedRecords).toContainEqual({
    type: "error",
    name: "TypeError",
    properties: { boundary: "server_reached_again_listener" },
  });
});

const NO_CONNECTION = { isConnected: false, isInternetReachable: false };
const CONNECTED = { isConnected: true, isInternetReachable: true };
const BALANCE_READ = "GET /accounts/primary";
const STATUS_READ = "GET /transfers/trf_1";
