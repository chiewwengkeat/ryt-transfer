// Its mocks run at require time, so they must load before any test module imports expo-router.
import "expo-router/testing-library";
import {
  focusManager,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";

import { setObservabilitySink } from "@/shared/observability/observability";
import type * as ShellQueryClient from "@/shell/query-client";
import "@/shell/translations";

import type * as NativeDoubles from "./harness/native-doubles";
import { resetNativeDoubles } from "./harness/native-doubles";
import { observedRecords, recordObservation } from "./harness/recording-sink";
import {
  mswServer,
  recordUnhandledRequest,
  sentRequests,
  unhandledRequests,
} from "./msw-server";

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
jest.mock("expo-crypto", () => ({
  ...jest.requireActual<object>("expo-crypto"),
  randomUUID: jest.requireActual<typeof NativeDoubles>(
    "./harness/native-doubles",
  ).randomUUIDDouble,
}));

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

beforeAll(() => {
  // A function, not "error": msw's built-in strategies let static-asset paths such as `.json` through.
  mswServer.listen({ onUnhandledRequest: recordUnhandledRequest });
});

beforeEach(() => {
  setObservabilitySink(recordObservation);
});

afterEach(() => {
  mockQueryClient?.clear();
  mockQueryClient = undefined;
  // TanStack's online and focus flags outlive a test that left either off, stalling every later retry.
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  observedRecords.splice(0);
  resetNativeDoubles();
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
