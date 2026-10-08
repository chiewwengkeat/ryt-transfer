// Hoisted above the import below: the Reanimated mock that import installs throws without it, leaving every
// animated view undefined.
jest.mock("react-native-worklets", () =>
  jest.requireActual<object>("react-native-worklets/src/mock"),
);
// Its mocks run at require time, so they must load before any test module imports expo-router.
import "expo-router/testing-library";
import {
  focusManager,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import type * as ContextStubs from "expo-router/build/testing-library/context-stubs";
import i18next, { changeLanguage } from "i18next";

import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import { integrityStandInStore } from "@/domains/approval/hooks/device-integrity-verdict";
import { transferFlowStore } from "@/screens/transfer/state/transfer-flow";
import { setObservabilitySink } from "@/shared/observability/observability";
import { forgetRequestOutcomes } from "@/shared/platform/offline";
import type * as ShellQueryClient from "@/shell/query-client";
import "@/shell/translations";

import type * as BiometricsDouble from "./biometrics-double";
import { resetBiometricsDouble } from "./biometrics-double";
import {
  contactsNativeDouble,
  resetContactsNativeDouble,
} from "./harness/contacts-native-double";
import type * as NativeDoubles from "./harness/native-doubles";
import { resetNativeDoubles } from "./harness/native-doubles";
import {
  obscuredTouchGuardNativeDouble,
  resetObscuredTouchGuardDouble,
} from "./harness/obscured-touch-guard-double";
import { observedRecords, recordObservation } from "./harness/recording-sink";
import {
  mswServer,
  recordUnhandledRequest,
  sentRequests,
  unhandledRequests,
} from "./msw-server";

// expo-contacts binds its native module as it loads, so no import above may load it before this line runs.
globalThis.expo.modules.ExpoContactsNext = contactsNativeDouble;
globalThis.expo.modules.ObscuredTouchGuard = obscuredTouchGuardNativeDouble;

// The preset's performance.now is a jest.fn, which records every one of React's calls: millions a suite, never cleared.
performance.now = () => Date.now();

// jest-expo leaves these native modules inert: the kv-store throws, the rest answer undefined.
jest.mock("expo-sqlite/kv-store", () => {
  const { kvStoreDouble } = jest.requireActual<typeof NativeDoubles>(
    "./harness/native-doubles",
  );
  return {
    __esModule: true,
    default: kvStoreDouble,
    Storage: kvStoreDouble,
    AsyncStorage: kvStoreDouble,
  };
});
// Doubled beneath the library, so its own key checks still throw as they would on a phone.
jest.mock("expo-secure-store/build/ExpoSecureStore", () => ({
  __esModule: true,
  default: jest.requireActual<typeof NativeDoubles>("./harness/native-doubles")
    .secureStoreNativeDouble,
}));
// Doubled beneath the library, so its own useNetworkState runs over the double.
jest.mock("expo-network/build/ExpoNetwork", () => ({
  __esModule: true,
  default: jest.requireActual<typeof NativeDoubles>("./harness/native-doubles")
    .networkNativeDouble,
}));
// Doubled beneath the library, so its own count of keys decides when the phone is told.
jest.mock("expo-screen-capture/build/ExpoScreenCapture", () => ({
  __esModule: true,
  default: jest.requireActual<typeof NativeDoubles>("./harness/native-doubles")
    .screenCaptureNativeDouble,
}));
jest.mock("expo-crypto", () => ({
  ...jest.requireActual<object>("expo-crypto"),
  randomUUID: jest.requireActual<typeof NativeDoubles>(
    "./harness/native-doubles",
  ).randomUUIDDouble,
}));
// With overrides, expo-router's test context strips "./" and the extension from its keys, so its ignore rule for
// ./+native-intent.tsx misses and it rejects the file as an invalid route. That mode never reads the file anyway.
jest.mock("expo-router/build/testing-library/context-stubs", () => {
  const actual = jest.requireActual<typeof ContextStubs>(
    "expo-router/build/testing-library/context-stubs",
  );
  return {
    ...actual,
    requireContextWithOverrides: (
      ...args: Parameters<typeof actual.requireContextWithOverrides>
    ) => {
      const context = actual.requireContextWithOverrides(...args);
      const routeKeys = context
        .keys()
        .filter((key) => key !== "+native-intent");
      return Object.assign(context, { keys: () => routeKeys });
    },
  };
});
// Jest runs as iOS, whose BackHandler ignores every listener: Android's lets a test press Back.
jest.mock("react-native/Libraries/Utilities/BackHandler", () =>
  jest.requireActual<object>(
    "react-native/Libraries/Utilities/BackHandler.android",
  ),
);
// Replaced whole: the library throws as it loads when no native module is registered.
jest.mock(
  "@sbaiahmed1/react-native-biometrics",
  () =>
    jest.requireActual<typeof BiometricsDouble>("./biometrics-double")
      .biometricsLibraryDouble,
);

// Each test gets its own client, so no test reads another's cache, with no retry backoff: RNTL's waitFor
// gives up after 1 s, before TanStack's first two retries have run.
let mockQueryClient: QueryClient | undefined;
jest.mock("@/shell/query-client", () => {
  const actual = jest.requireActual<typeof ShellQueryClient>(
    "@/shell/query-client",
  );
  // Defined after the spread: Babel's object spread reads a getter once and keeps the value.
  return Object.defineProperty({ __esModule: true, ...actual }, "queryClient", {
    enumerable: true,
    get() {
      if (mockQueryClient === undefined) {
        mockQueryClient = actual.createQueryClient();
        // setDefaultOptions replaces every default, so the app's retry rule is handed back with the rest.
        const defaults = mockQueryClient.getDefaultOptions();
        mockQueryClient.setDefaultOptions({
          ...defaults,
          queries: { ...defaults.queries, staleTime: 0, retryDelay: 0 },
        });
      }
      return mockQueryClient;
    },
  });
});

const appLanguageAtLaunch = i18next.language;

beforeAll(() => {
  // A function, not "error": msw's built-in strategies let static-asset paths such as `.json` through.
  mswServer.listen({ onUnhandledRequest: recordUnhandledRequest });
  // Ahead of every test, as at launch, or its reinstall wipe would erase keys a test paired before rendering. In a
  // hook, so a demo-build file launches it first as a demo; actual, so a file that mocks it still runs the launch.
  jest.requireActual("@/shell/app-launch");
});

beforeEach(() => {
  setObservabilitySink(recordObservation);
});

afterEach(async () => {
  // clear() leaves each mutation's 5-minute gc timer running, which holds a single-file run open.
  for (const mutation of mockQueryClient?.getMutationCache().getAll() ?? [])
    mutation.destroy();
  mockQueryClient?.clear();
  mockQueryClient = undefined;
  // TanStack's online and focus flags outlive a test that left either off, stalling every later retry.
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  observedRecords.splice(0);
  // Leaving the flow keeps an unconfirmed approval, so only this clears one before the next test.
  transferFlowStore.setState(transferFlowStore.getInitialState(), true);
  resetNativeDoubles();
  resetBiometricsDouble();
  approvalSettingsStore.setState(approvalSettingsStore.getInitialState(), true);
  integrityStandInStore.setState(integrityStandInStore.getInitialState(), true);
  resetContactsNativeDouble();
  resetObscuredTouchGuardDouble();
  // A test that switched language would start the next one in it: clearing the stored pick leaves i18next as it is.
  await changeLanguage(appLanguageAtLaunch);
  // A test that a request left offline would start the next one offline.
  forgetRequestOutcomes();
  mswServer.resetHandlers();
  sentRequests.splice(0);
  // The app sees the throw above as a 500, which an error-state test could mistake for its scenario.
  const missed = unhandledRequests.splice(0);
  if (missed.length > 0)
    throw new Error(`No mock handled: ${missed.join(", ")}`);
});

afterAll(() => {
  mswServer.close();
});
