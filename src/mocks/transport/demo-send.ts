import { getResponse, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

import type { Send } from "@/shared/http/transport";

export function createDemoSend(getHandlers: () => RequestHandler[]): Send {
  return async (request) => {
    let response: Response | undefined;
    try {
      response = await getResponse(getHandlers(), request);
    } catch (failure) {
      // The 500 setupServer gives a handler that throws: a phone must see what Jest sees.
      const { name, message, stack } =
        failure instanceof Error ? failure : new Error(String(failure));
      return HttpResponse.json(
        { name, message, stack },
        { status: 500, statusText: "Unhandled Exception" },
      );
    }
    // fetch rejects with a TypeError on a dead network; no answer, and a scenario's
    // HttpResponse.error(), must reach the app exactly as that does.
    if (response === undefined || response.type === "error")
      throw new TypeError("Network request failed");
    return response;
  };
}
