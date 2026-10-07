import { getResponse, http } from "msw";
import { setupServer } from "msw/node";

import { handlersForActiveScenario } from "@/mocks/demo-bank";

// Resolved per request, as a phone's demo layer does, so a mid-test scenario switch applies.
// Matching every request, it reports the unmatched ones itself: msw would pass them through.
export const mswServer = setupServer(
  http.all(
    "*",
    async ({ request }) =>
      (await getResponse(handlersForActiveScenario(), request)) ??
      recordUnhandledRequest(request),
  ),
);

// Cloned, so a test can still read the body after a handler has consumed the original.
export const sentRequests: Request[] = [];
mswServer.events.on("request:start", ({ request }) => {
  sentRequests.push(request.clone());
});

export const unhandledRequests: string[] = [];

export function recordUnhandledRequest(request: Request) {
  unhandledRequests.push(`${request.method} ${request.url}`);
  throw new Error(`No mock handler for ${request.method} ${request.url}`);
}
