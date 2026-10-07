import { delay, http, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

import { API_BASE_URL } from "@/shared/config/config";
import {
  configureTransport,
  requestJson,
  TransportErrorKind,
} from "@/shared/http/transport";

import { createDemoSend } from "./demo-send";

const PROBE_URL = `${API_BASE_URL}/probe`;
const activeHandlers: RequestHandler[] = [];
const demoSend = createDemoSend(() => activeHandlers);

afterEach(() => {
  activeHandlers.splice(0);
  configureTransport();
});

it("answers a request with the handler that matches it", async () => {
  activeHandlers.push(
    http.get(PROBE_URL, () => HttpResponse.json({ answered: true })),
  );

  const response = await demoSend(new Request(PROBE_URL));

  expect(await response.json()).toEqual({ answered: true });
});

it("rejects a request no handler answers, as fetch does on a dead network", async () => {
  await expect(demoSend(new Request(PROBE_URL))).rejects.toThrow(TypeError);
});

it("rejects a scenario's network error, as fetch does on a dead network", async () => {
  activeHandlers.push(http.get(PROBE_URL, () => HttpResponse.error()));

  await expect(demoSend(new Request(PROBE_URL))).rejects.toThrow(TypeError);
});

it("answers from the handlers active when each request arrives", async () => {
  activeHandlers.push(
    http.get(PROBE_URL, () => HttpResponse.json({ scenario: "first" })),
  );
  await demoSend(new Request(PROBE_URL));

  activeHandlers.splice(
    0,
    1,
    http.get(PROBE_URL, () => HttpResponse.json({ scenario: "second" })),
  );
  const response = await demoSend(new Request(PROBE_URL));

  expect(await response.json()).toEqual({ scenario: "second" });
});

it("lets the transport time out a handler that ignores the abort", async () => {
  activeHandlers.push(
    http.get(PROBE_URL, async () => {
      await delay(200);
      return HttpResponse.json({});
    }),
  );
  configureTransport({ send: demoSend });

  await expect(requestJson("/probe", { timeoutMs: 20 })).rejects.toMatchObject({
    kind: TransportErrorKind.Timeout,
  });
});

it("reaches the app as the transport's network error when unanswered", async () => {
  configureTransport({ send: demoSend });

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Network,
  });
});
