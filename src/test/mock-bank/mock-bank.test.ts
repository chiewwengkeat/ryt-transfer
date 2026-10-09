import { http, HttpResponse } from "msw";

import { clearTransferScenario, pickTransferScenario } from "@/mocks/bank/bank";

import {
  BANK_ORIGIN,
  mswServer,
  sentRequests,
  unhandledRequests,
} from "./mock-bank";

const PROBE_URL = "https://api.example.test/probe";

it("answers each request by the scenario active when it is sent, switched mid-test", async () => {
  const balanceUrl = `${BANK_ORIGIN}/accounts/primary`;

  pickTransferScenario("transfer.offline");
  await expect(fetch(balanceUrl)).rejects.toThrow();
  clearTransferScenario();
  const reconnected = await fetch(balanceUrl);

  expect(reconnected.status).toBe(200);
});

it("answers a request through the shared mock server", async () => {
  mswServer.use(
    http.get(PROBE_URL, () => HttpResponse.json({ probe: "answered" })),
  );

  const response = await fetch(PROBE_URL);

  expect(await response.json()).toEqual({ probe: "answered" });
});

it("records the method, URL, headers and body of each request the test sent", async () => {
  mswServer.use(http.post(PROBE_URL, () => HttpResponse.json({})));

  await fetch(PROBE_URL, {
    method: "POST",
    headers: { "Idempotency-Key": "probe-key" },
    body: JSON.stringify({ probe: true }),
  });

  // Only this test's request: the GET the test above sent was cleared after it.
  expect(sentRequests.map((request) => request.method)).toEqual(["POST"]);
  const [request] = sentRequests;
  expect(request?.url).toBe(PROBE_URL);
  expect(request?.headers.get("Idempotency-Key")).toBe("probe-key");
  expect(await request?.json()).toEqual({ probe: true });
});

it("catches a request no handler answers, even for a .json path", async () => {
  await fetch("https://api.example.test/scenarios/unmocked.json");

  expect(unhandledRequests.splice(0)).toEqual([
    "GET https://api.example.test/scenarios/unmocked.json",
  ]);
});
