import { getResponse } from "msw";
import type { RequestHandler } from "msw";

import type { Send } from "@/shared/http/transport";

export function createDemoSend(getHandlers: () => RequestHandler[]): Send {
  return async (request) => {
    const response = await getResponse(getHandlers(), request);
    // fetch rejects with a TypeError on a dead network; no answer, and a scenario's
    // HttpResponse.error(), must reach the app exactly as that does.
    if (response === undefined || response.type === "error")
      throw new TypeError("Network request failed");
    return response;
  };
}
