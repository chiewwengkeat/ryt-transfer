// Its mocks run at require time, so they must load before any test module imports expo-router.
import "expo-router/testing-library";

import {
  mswServer,
  recordUnhandledRequest,
  sentRequests,
  unhandledRequests,
} from "./msw-server";

beforeAll(() => {
  // A function, not "error": msw's built-in strategies let static-asset paths such as `.json` through.
  mswServer.listen({ onUnhandledRequest: recordUnhandledRequest });
});

afterEach(() => {
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
