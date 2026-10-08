import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { AppState } from "react-native";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { reportRequestOutcome } from "@/shared/platform/offline";
import { moveAppTo } from "@/test/harness/app-state";
import { setPhoneNetwork } from "@/test/harness/native-doubles";

import { createQueryClient } from "./query-client";

// ⛔ gcTime 0 on every query and mutation here: a cached entry's 5-minute timer keeps a single-file run alive.

const OFFLINE = { isConnected: false, isInternetReachable: false };
const BALANCE_READ = "GET /accounts/primary";

function letPendingFetchesRun() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

it("holds a read while the phone is offline and sends it once the phone reconnects", async () => {
  const client = createQueryClient();
  client.mount();
  setPhoneNetwork(OFFLINE);
  const queryFn = jest.fn(() => Promise.resolve("balance"));

  const read = client.fetchQuery({ queryKey: ["balance"], queryFn, gcTime: 0 });
  await letPendingFetchesRun();
  const attemptsWhileOffline = queryFn.mock.calls.length;
  setPhoneNetwork({ isConnected: true, isInternetReachable: true });

  expect(attemptsWhileOffline).toBe(0);
  await expect(read).resolves.toBe("balance");
  client.unmount();
});

it("sends a write once, at once, even while the phone is offline", async () => {
  const client = createQueryClient();
  client.mount();
  setPhoneNetwork(OFFLINE);
  const mutationFn = jest.fn(() =>
    Promise.reject(new TransportError(TransportErrorKind.Timeout)),
  );

  await expect(
    new MutationObserver(client, { mutationFn, gcTime: 0 }).mutate(),
  ).rejects.toThrow(TransportError);

  expect(mutationFn).toHaveBeenCalledTimes(1);
  client.unmount();
});

it("fetches a stale read again when the app comes back to the front, not when it leaves", async () => {
  const client = createQueryClient();
  client.mount();
  const queryFn = jest.fn(() => Promise.resolve("balance"));
  const stopObserving = new QueryObserver(client, {
    queryKey: ["balance"],
    queryFn,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();

  moveAppTo("background");
  await letPendingFetchesRun();
  const fetchesAfterLeaving = queryFn.mock.calls.length;
  moveAppTo("active");
  await letPendingFetchesRun();

  expect(fetchesAfterLeaving).toBe(1);
  expect(queryFn).toHaveBeenCalledTimes(2);
  stopObserving();
  client.unmount();
});

it("fetches nothing again when a face or fingerprint prompt closes and the app is active once more", async () => {
  const client = createQueryClient();
  client.mount();
  const queryFn = jest.fn(() => Promise.resolve("balance"));
  const stopObserving = new QueryObserver(client, {
    queryKey: ["balance"],
    queryFn,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();

  moveAppTo("inactive");
  await letPendingFetchesRun();
  moveAppTo("active");
  await letPendingFetchesRun();

  expect(queryFn).toHaveBeenCalledTimes(1);
  stopObserving();
  client.unmount();
});

it("keeps polling a read after Android reopens the app from Back", async () => {
  const client = createQueryClient();
  client.mount();
  moveAppTo("background");
  client.unmount();
  client.mount();
  moveAppTo("active");
  const queryFn = jest.fn(() => Promise.resolve("processing"));

  const stopObserving = new QueryObserver(client, {
    queryKey: ["transfer"],
    queryFn,
    refetchInterval: 1,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();

  expect(queryFn.mock.calls.length).toBeGreaterThan(1);
  stopObserving();
  client.unmount();
});

it("keeps polling a read after Android reopens the app from Back, active again before the app mounts", async () => {
  const client = createQueryClient();
  client.mount();
  moveAppTo("background");
  client.unmount();
  const stateBeforeReopen = AppState.currentState;
  Object.assign(AppState, { currentState: "active" });
  moveAppTo("active");
  client.mount();
  Object.assign(AppState, { currentState: stateBeforeReopen });
  const queryFn = jest.fn(() => Promise.resolve("processing"));

  const stopObserving = new QueryObserver(client, {
    queryKey: ["transfer"],
    queryFn,
    refetchInterval: 1,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();

  expect(queryFn.mock.calls.length).toBeGreaterThan(1);
  stopObserving();
  client.unmount();
});

// ⛔ Keep these after the offline write, which ends offline: they prove each test starts online.
it.each([
  {
    failure: "a dropped connection",
    error: new TransportError(TransportErrorKind.Network),
    attempts: 3,
  },
  {
    failure: "a timeout",
    error: new TransportError(TransportErrorKind.Timeout),
    attempts: 3,
  },
  {
    failure: "a server failure",
    error: new TransportError(TransportErrorKind.Http, 503),
    attempts: 3,
  },
  {
    failure: "a refusal",
    error: new TransportError(TransportErrorKind.Http, 404),
    attempts: 1,
  },
  {
    failure: "an ended session",
    error: new TransportError(TransportErrorKind.Http, 401),
    attempts: 1,
  },
  {
    failure: "a cancelled request",
    error: new TransportError(TransportErrorKind.Aborted),
    attempts: 1,
  },
  {
    failure: "a bug",
    error: new TypeError("undefined is not a function"),
    attempts: 1,
  },
])(
  "tries a read that fails with $failure $attempts time(s)",
  async ({ error, attempts }) => {
    const queryFn = jest.fn(() => Promise.reject(error));

    await expect(
      createQueryClient().fetchQuery({
        queryKey: ["balance"],
        queryFn,
        retryDelay: 0,
        gcTime: 0,
      }),
    ).rejects.toBe(error);

    expect(queryFn).toHaveBeenCalledTimes(attempts);
  },
);

it("reads a query that found no network again once a request reaches the bank, and not again until it is answered", async () => {
  const client = createQueryClient();
  client.mount();
  const queryFn = jest.fn(() =>
    Promise.reject(new TransportError(TransportErrorKind.Network)),
  );
  const stopObserving = new QueryObserver(client, {
    queryKey: ["balance"],
    queryFn,
    retry: false,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
  reportRequestOutcome(BALANCE_READ);
  await letPendingFetchesRun();
  const readsOnceTheBankWasFirstReachedAgain = queryFn.mock.calls.length;

  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
  reportRequestOutcome(BALANCE_READ);
  await letPendingFetchesRun();

  expect(readsOnceTheBankWasFirstReachedAgain).toBe(2);
  expect(queryFn).toHaveBeenCalledTimes(2);
  stopObserving();
  client.unmount();
});

it("reads a query that found no network again after an answer, though it was read again before", async () => {
  const client = createQueryClient();
  client.mount();
  const noNetwork = new TransportError(TransportErrorKind.Network);
  const queryFn = jest
    .fn<Promise<string>, []>()
    .mockRejectedValueOnce(noNetwork)
    .mockRejectedValueOnce(noNetwork)
    .mockResolvedValueOnce("balance")
    .mockRejectedValueOnce(noNetwork)
    .mockResolvedValue("balance");
  const observer = new QueryObserver(client, {
    queryKey: ["balance"],
    queryFn,
    retry: false,
    gcTime: 0,
  });
  const stopObserving = observer.subscribe(() => undefined);
  await letPendingFetchesRun();
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
  reportRequestOutcome(BALANCE_READ);
  await letPendingFetchesRun();
  await observer.refetch();
  await observer.refetch();
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);

  reportRequestOutcome(BALANCE_READ);
  await letPendingFetchesRun();

  expect(queryFn).toHaveBeenCalledTimes(5);
  stopObserving();
  client.unmount();
});

it("reads a query again with the retries of the screen reading it, not of one that only shows it", async () => {
  const client = createQueryClient();
  client.mount();
  const queryFn = jest.fn(() =>
    Promise.reject(new TransportError(TransportErrorKind.Network)),
  );
  const stopReading = new QueryObserver(client, {
    queryKey: ["transfer"],
    queryFn,
    retry: 0,
    gcTime: 0,
  }).subscribe(() => undefined);
  await letPendingFetchesRun();
  const stopShowing = new QueryObserver(client, {
    queryKey: ["transfer"],
    queryFn,
    enabled: false,
    retryDelay: 0,
    gcTime: 0,
  }).subscribe(() => undefined);
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);

  reportRequestOutcome(BALANCE_READ);
  await letPendingFetchesRun();

  expect(queryFn).toHaveBeenCalledTimes(2);
  stopShowing();
  stopReading();
  client.unmount();
});

it("lets a read already on its way land, rather than send it again, once a request reaches the bank", async () => {
  const client = createQueryClient();
  client.mount();
  let releaseHeldAnswer = () => {};
  const queryFn = jest
    .fn<Promise<string>, []>()
    .mockResolvedValueOnce("balance")
    .mockRejectedValueOnce(new TransportError(TransportErrorKind.Network))
    .mockReturnValueOnce(
      new Promise((resolve) => {
        releaseHeldAnswer = () => {
          resolve("balance held in flight");
        };
      }),
    )
    .mockResolvedValue("balance sent again");
  const observer = new QueryObserver(client, {
    queryKey: ["balance"],
    queryFn,
    retry: false,
    gcTime: 0,
  });
  const stopObserving = observer.subscribe(() => undefined);
  await letPendingFetchesRun();
  await observer.refetch();
  reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);
  void observer.refetch();

  reportRequestOutcome(BALANCE_READ);
  releaseHeldAnswer();
  await letPendingFetchesRun();

  expect(queryFn).toHaveBeenCalledTimes(3);
  expect(observer.getCurrentResult().data).toBe("balance held in flight");
  stopObserving();
  client.unmount();
});

it.each([
  {
    failure: "a refusal",
    error: new TransportError(TransportErrorKind.Http, 404),
  },
  {
    failure: "a server failure",
    error: new TransportError(TransportErrorKind.Http, 503),
  },
  {
    failure: "an answer it cannot read",
    error: new TransportError(TransportErrorKind.Unreadable),
  },
  {
    failure: "a timeout",
    error: new TransportError(TransportErrorKind.Timeout),
  },
  {
    failure: "a cancelled request",
    error: new TransportError(TransportErrorKind.Aborted),
  },
  {
    failure: "a bug",
    error: new TypeError("undefined is not a function"),
  },
])(
  "leaves a query that failed with $failure alone once a request reaches the bank again",
  async ({ error }) => {
    const client = createQueryClient();
    client.mount();
    const queryFn = jest.fn(() => Promise.reject(error));
    const stopObserving = new QueryObserver(client, {
      queryKey: ["balance"],
      queryFn,
      retry: false,
      gcTime: 0,
    }).subscribe(() => undefined);
    await letPendingFetchesRun();
    reportRequestOutcome(BALANCE_READ, TransportErrorKind.Network);

    reportRequestOutcome(BALANCE_READ);
    await letPendingFetchesRun();

    expect(queryFn).toHaveBeenCalledTimes(1);
    stopObserving();
    client.unmount();
  },
);
