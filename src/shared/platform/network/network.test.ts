import {
  setPhoneNetwork,
  setPhoneNetworkWithoutAnEvent,
} from "@/test/doubles/native-doubles";

import { subscribeToPhoneConnection } from "./network";

afterEach(() => {
  jest.useRealTimers();
});

it("reports the phone's connection as soon as it subscribes", async () => {
  setPhoneNetwork(OFFLINE);
  const heard: boolean[] = [];

  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });
  await settle();
  unsubscribe();

  expect(heard).toEqual([false]);
});

it("reports each change the phone announces", async () => {
  const heard: boolean[] = [];
  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });
  await settle();

  setPhoneNetwork(OFFLINE);
  setPhoneNetwork(ONLINE);
  unsubscribe();

  expect(heard).toEqual([true, false, true]);
});

it("keeps a change that arrives before the first read answers", async () => {
  const heard: boolean[] = [];

  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });
  setPhoneNetwork(OFFLINE);
  await settle();
  unsubscribe();

  expect(heard).toEqual([false]);
});

it("reports nothing after unsubscribing, the first read included", async () => {
  const heard: boolean[] = [];

  subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  })();
  setPhoneNetwork(OFFLINE);
  await settle();

  expect(heard).toEqual([]);
});

it("counts a phone that gives no answer as connected", async () => {
  setPhoneNetwork({});
  const heard: boolean[] = [];

  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });
  await settle();
  unsubscribe();

  expect(heard).toEqual([true]);
});

it("reads the connection again every 2 seconds while the phone says it has none, until a reading says it is back", async () => {
  jest.useFakeTimers();
  setPhoneNetwork(OFFLINE);
  const heard: boolean[] = [];
  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });

  await jest.advanceTimersByTimeAsync(2_000);
  setPhoneNetworkWithoutAnEvent(ONLINE);
  await jest.advanceTimersByTimeAsync(2_000);
  setPhoneNetworkWithoutAnEvent(OFFLINE);
  await jest.advanceTimersByTimeAsync(10_000);
  unsubscribe();

  expect(heard).toEqual([false, false, true]);
});

it("keeps a change that arrives while a reading taken again is on its way", async () => {
  jest.useFakeTimers();
  setPhoneNetwork(OFFLINE);
  const heard: boolean[] = [];
  const unsubscribe = subscribeToPhoneConnection((connected) => {
    heard.push(connected);
  });
  await jest.advanceTimersByTimeAsync(0);

  // Synchronous, so the reading taken again is still on its way when the change arrives.
  jest.advanceTimersByTime(2_000);
  setPhoneNetwork(ONLINE);
  await jest.advanceTimersByTimeAsync(0);
  unsubscribe();

  expect(heard).toEqual([false, true]);
});

const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
