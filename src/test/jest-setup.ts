// Its mocks run at require time, so they must load before any test module imports expo-router.
import "expo-router/testing-library";

import { setObservabilitySink } from "@/shared/observability/observability";
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

beforeAll(() => {
  // A function, not "error": msw's built-in strategies let static-asset paths such as `.json` through.
  mswServer.listen({ onUnhandledRequest: recordUnhandledRequest });
});

beforeEach(() => {
  setObservabilitySink(recordObservation);
});

afterEach(() => {
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
