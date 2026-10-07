import { setupServer } from "msw/node";

import { handlersForActiveScenario } from "@/mocks/demo-bank";

// The bank's handlers are the initial ones, so resetHandlers() after each test brings them back.
export const mswServer = setupServer(...handlersForActiveScenario());

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
