import { delay, http, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

import { bankPorts } from "@/mocks/bank/ports/ports";
import type * as BankPorts from "@/mocks/bank/ports/ports";
import { clearTransferScenario, pickTransferScenario } from "@/mocks/bank/bank";
import { API_BASE_URL } from "@/shared/config/config";
import {
  configureTransport,
  requestJson,
} from "@/shared/http/transport/transport";
import { TransportErrorKind } from "@/shared/http/transport-error/transport-error";
import { mswServer } from "@/test/mock-bank/mock-bank";

import demoLayer, { createDemoSend } from "./demo-layer";
import type * as DemoLayerModule from "./demo-layer";

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

it("answers a handler that throws with the 500 that Jest's server gives it", async () => {
  const handlerThatThrows = http.get(PROBE_URL, () => {
    throw new Error("bank bug");
  });
  mswServer.use(handlerThatThrows);
  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 500,
  });
  activeHandlers.push(handlerThatThrows);
  configureTransport({ send: demoSend });

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 500,
  });
});

it("reaches the app as the transport's network error when unanswered", async () => {
  configureTransport({ send: demoSend });

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Network,
  });
});

it("answers at once whether No biometrics is picked, then each time that changes", () => {
  const answers: boolean[] = [];

  const unsubscribe = demoLayer.subscribeToBiometricsOff((biometricsOff) => {
    answers.push(biometricsOff);
  });
  pickTransferScenario("transfer.biometrics_unavailable");
  pickTransferScenario("transfer.offline");
  clearTransferScenario();
  unsubscribe();
  pickTransferScenario("transfer.biometrics_unavailable");

  expect(answers).toEqual([false, true, false]);
});

it("answers that biometrics are off at once when the app restarts with No biometrics still picked", () => {
  pickTransferScenario("transfer.biometrics_unavailable");
  const answersAfterRestart: boolean[] = [];

  const fetchOfThisApp = globalThis.fetch;
  // A fresh module registry is a fresh app: nothing survives it but what the bank saved.
  try {
    jest.isolateModules(() => {
      jest
        .requireActual<typeof BankPorts>("@/mocks/bank/ports/ports")
        .bindBankPorts(bankPorts());
      jest
        .requireActual<typeof DemoLayerModule>("./demo-layer")
        .default.subscribeToBiometricsOff((biometricsOff) => {
          answersAfterRestart.push(biometricsOff);
        })();
    });
  } finally {
    // The fresh app's Expo runtime installs its own fetch, which Jest's server does not intercept.
    globalThis.fetch = fetchOfThisApp;
  }

  expect(answersAfterRestart).toEqual([true]);
});

const PROBE_URL = `${API_BASE_URL}/probe`;
const activeHandlers: RequestHandler[] = [];
// ⛔ A fresh array per call, as the mock bank hands out: a shared one passes a send that reads it once.
const demoSend = createDemoSend(() => [...activeHandlers]);
