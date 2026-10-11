// ⛔ Type imports only from the doubled packages: a value import re-enters the mock factory building them.
import type { ObservedRecord } from "@/shared/observability/observability/observability";
import type { NetworkState } from "expo-network";
import {
  type ComponentProps,
  createElement,
  isValidElement,
  useLayoutEffect,
} from "react";
import type * as ReactNativeScreens from "react-native-screens";

export const kvStoreDouble = {
  getItemSync: (key: string) => kvEntries.get(key) ?? null,
  setItemSync: (
    key: string,
    value: string | ((previous: string | null) => string),
  ) => {
    kvEntries.set(
      key,
      typeof value === "function" ? value(kvEntries.get(key) ?? null) : value,
    );
  },
  removeItemSync: (key: string) => kvEntries.delete(key),
  getItemAsync: (key: string) => Promise.resolve(kvEntries.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    kvEntries.set(key, value);
    return Promise.resolve();
  },
  removeItemAsync: (key: string) => Promise.resolve(kvEntries.delete(key)),
};

export const secureStoreEntries = new Map<
  string,
  { value: string; options: Record<string, unknown> }
>();

export const secureStoreNativeDouble = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getValueWithKeyAsync: (key: string) =>
    Promise.resolve(secureStoreEntries.get(key)?.value ?? null),
  setValueWithKeyAsync: (
    value: string,
    key: string,
    options: Record<string, unknown>,
  ) => {
    secureStoreEntries.set(key, { value, options });
    return Promise.resolve();
  },
  deleteValueWithKeyAsync: (key: string) => {
    secureStoreEntries.delete(key);
    return Promise.resolve();
  },
  getValueWithKeySync: (key: string) =>
    secureStoreEntries.get(key)?.value ?? null,
  setValueWithKeySync: (
    value: string,
    key: string,
    options: Record<string, unknown>,
  ) => {
    secureStoreEntries.set(key, { value, options });
  },
  canUseBiometricAuthentication: () => false,
};

// Sequential, so a test can name the idempotency key a request should carry.
export function randomUUIDDouble() {
  uuidsIssued += 1;
  return `00000000-0000-4000-8000-${String(uuidsIssued).padStart(12, "0")}`;
}

export const networkNativeDouble = {
  getNetworkStateAsync: () => Promise.resolve(phoneNetwork),
  addListener: (
    _eventName: string,
    listener: (state: NetworkState) => void,
  ) => {
    networkListeners.add(listener);
    return {
      remove: () => {
        networkListeners.delete(listener);
      },
    };
  },
};

export function setPhoneNetwork(state: NetworkState) {
  phoneNetwork = state;
  for (const listener of networkListeners) listener(state);
}

export function setPhoneNetworkWithoutAnEvent(state: NetworkState) {
  phoneNetwork = state;
}

export const screenCaptureNativeDouble = {
  preventScreenCapture: () => {
    screenCaptureBlocked = true;
    return Promise.resolve();
  },
  allowScreenCapture: () => {
    screenCaptureBlocked = false;
    return Promise.resolve();
  },
  enableAppSwitcherProtection: (blurIntensity: number) => {
    blurIntensityInAppSwitcher = blurIntensity;
    return Promise.resolve();
  },
};

export function isScreenCaptureBlocked() {
  return screenCaptureBlocked;
}

export function appSwitcherBlurIntensity() {
  return blurIntensityInAppSwitcher;
}

// Listeners stay: their owners remove them, and dropping one here would leave its owner deaf.
export function resetNativeDoubles() {
  kvEntries.clear();
  secureStoreEntries.clear();
  uuidsIssued = 0;
  phoneNetwork = CONNECTED_NETWORK;
  // As a production launch leaves it, since the root's block at load runs once per file rather than per test.
  // Never the reverse: the library would see its key still held and skip blocking again.
  screenCaptureBlocked = true;
}

// State lives in this file, not on the object: jest-expo copies the object's keys onto a new module on every require.
export const obscuredTouchGuardNativeDouble = {
  enable: () => {
    guardOn = true;
  },
  disable: () => {
    guardOn = false;
  },
  addListener: (eventName: string, listener: () => void) => {
    if (eventName === "onObscuredTouchDropped") dropListeners.add(listener);
    return {
      remove: () => {
        dropListeners.delete(listener);
      },
    };
  },
};

// A tap through another app's window drawn over this one: dropped and reported only while the guard is on.
export function touchThroughOverlay() {
  if (!guardOn) return;
  for (const listener of dropListeners) listener();
}

export function isObscuredTouchGuardOn() {
  return guardOn;
}

// Listeners stay: each holder removes its own on release.
export function resetObscuredTouchGuardDouble() {
  guardOn = false;
}

// Jest draws no frames, so what each native stack is handed on top, commit by commit, is what a phone animates to.
export function reactNativeScreensRecordingTopRoutes() {
  const actual = jest.requireActual<typeof ReactNativeScreens>(
    "react-native-screens",
  );
  return {
    ...actual,
    ScreenStack(props: ComponentProps<typeof actual.ScreenStack>) {
      const topRouteName = [props.children]
        .flat()
        .filter(
          isValidElement<{
            isPreloaded: boolean;
            descriptor: { route: { name: string } };
          }>,
        )
        .findLast((scene) => !scene.props.isPreloaded)?.props.descriptor
        .route.name;
      useLayoutEffect(() => {
        if (topRouteName !== undefined) routesDrawnOnTop.push(topRouteName);
      });
      return createElement(actual.ScreenStack, props);
    },
  };
}

export function watchRoutesDrawnOnTop() {
  const watchedFrom = routesDrawnOnTop.length;
  return () => routesDrawnOnTop.slice(watchedFrom);
}

export function resetScreenStackDouble() {
  routesDrawnOnTop.splice(0);
}

export const observedRecords: ObservedRecord[] = [];

export function recordObservation(record: ObservedRecord) {
  observedRecords.push(record);
}

export function reportedScenarios() {
  return observedRecords.flatMap(({ properties }) => properties.scenario ?? []);
}

const kvEntries = new Map<string, string>();

let uuidsIssued = 0;

const CONNECTED_NETWORK: NetworkState = {
  isConnected: true,
  isInternetReachable: true,
};
let phoneNetwork = CONNECTED_NETWORK;
const networkListeners = new Set<(state: NetworkState) => void>();

let screenCaptureBlocked = false;
let blurIntensityInAppSwitcher: number | null = null;

let guardOn = false;
const dropListeners = new Set<() => void>();

const routesDrawnOnTop: string[] = [];
