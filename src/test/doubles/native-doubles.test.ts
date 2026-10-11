import { randomUUID } from "expo-crypto";
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  NetworkStateType,
} from "expo-network";
import {
  kvStoreDouble,
  secureStoreNativeDouble,
  setPhoneNetwork,
} from "./native-doubles";

it("issues the same UUIDs in the same order in every test", () => {
  expect([randomUUID(), randomUUID()]).toEqual([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ]);

  kvStoreDouble.setItemSync("left-behind", "by the test above");
  secureStoreNativeDouble.setValueWithKeySync(
    "left-behind",
    "by the test above",
    {},
  );
  setPhoneNetwork(OFFLINE);
});

// ⛔ Keep this after the test above: alone, it passes whatever the reset leaves behind.
it("starts each test with empty stores, a connected phone and the first UUID", async () => {
  expect(kvStoreDouble.getItemSync("left-behind")).toBeNull();
  expect(secureStoreNativeDouble.getValueWithKeySync("left-behind")).toBeNull();
  expect(await getNetworkStateAsync()).toMatchObject({ isConnected: true });
  expect(randomUUID()).toBe("00000000-0000-4000-8000-000000000001");
});

it("tells the phone's network listeners when the connection changes", () => {
  const heard: (boolean | undefined)[] = [];
  const subscription = addNetworkStateListener((state) => {
    heard.push(state.isConnected);
  });

  setPhoneNetwork(OFFLINE);
  subscription.remove();
  setPhoneNetwork({ ...OFFLINE, isConnected: true });

  expect(heard).toEqual([false]);
});

const OFFLINE = {
  type: NetworkStateType.NONE,
  isConnected: false,
  isInternetReachable: false,
};
