import { delay, http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/shared/config/config";
import { mswServer, sentRequests } from "@/test/msw-server";

import {
  addUnauthorizedListener,
  configureTransport,
  requestJson,
  TransportError,
  TransportErrorKind,
} from "./transport";

const PROBE_URL = `${API_BASE_URL}/probe`;

afterEach(() => {
  configureTransport();
});

it("returns the API's JSON answer", async () => {
  mswServer.use(http.get(PROBE_URL, () => HttpResponse.json({ balance: 1 })));

  await expect(requestJson("/probe")).resolves.toEqual({ balance: 1 });
});

it("sends a write's JSON body with the caller's idempotency key", async () => {
  mswServer.use(http.post(PROBE_URL, () => HttpResponse.json({})));

  await requestJson("/probe", {
    method: "POST",
    body: { amount: 5 },
    idempotencyKey: "key-1",
  });

  const [request] = sentRequests;
  expect(request?.headers.get("Idempotency-Key")).toBe("key-1");
  expect(request?.headers.get("Content-Type")).toBe("application/json");
  expect(await request?.json()).toEqual({ amount: 5 });
});

it("rejects an error answer with its status and code", async () => {
  mswServer.use(
    http.post(PROBE_URL, () =>
      HttpResponse.json(
        { error: { code: "INSUFFICIENT_FUNDS", message: "Not enough" } },
        { status: 422 },
      ),
    ),
  );

  const failure = requestJson("/probe", { method: "POST", body: {} });

  await expect(failure).rejects.toBeInstanceOf(TransportError);
  await expect(failure).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 422,
    code: "INSUFFICIENT_FUNDS",
  });
});

it("keeps the status of an error page that is not JSON", async () => {
  mswServer.use(
    http.get(PROBE_URL, () =>
      HttpResponse.text("<html>Bad gateway</html>", { status: 502 }),
    ),
  );

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 502,
    code: undefined,
  });
});

it("tells the session-ended listeners about a 401, and still rejects", async () => {
  mswServer.use(
    http.get(PROBE_URL, () =>
      HttpResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Signed out" } },
        { status: 401 },
      ),
    ),
  );
  const heard = jest.fn();
  const stopListening = addUnauthorizedListener(heard);

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 401,
  });
  stopListening();

  expect(heard).toHaveBeenCalledTimes(1);
});

it("rejects as network when the network is dead", async () => {
  mswServer.use(http.get(PROBE_URL, () => HttpResponse.error()));

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Network,
  });
});

it("rejects as timeout when the answer outlives the request's timeout", async () => {
  mswServer.use(
    http.get(PROBE_URL, async () => {
      await delay(200);
      return HttpResponse.json({});
    }),
  );

  await expect(requestJson("/probe", { timeoutMs: 20 })).rejects.toMatchObject({
    kind: TransportErrorKind.Timeout,
  });
});

it("rejects as aborted when its caller gives up", async () => {
  mswServer.use(
    http.get(PROBE_URL, async () => {
      await delay(200);
      return HttpResponse.json({});
    }),
  );
  const caller = new AbortController();

  const answer = requestJson("/probe", { signal: caller.signal });
  caller.abort();

  await expect(answer).rejects.toMatchObject({
    kind: TransportErrorKind.Aborted,
  });
});

it("sends through the send the shell injects instead of fetch", async () => {
  configureTransport({
    send: () => Promise.resolve(HttpResponse.json({ from: "injected" })),
  });

  await expect(requestJson("/probe")).resolves.toEqual({ from: "injected" });
  expect(sentRequests).toEqual([]);
});

it("adds the host app's auth headers to every request", async () => {
  mswServer.use(http.get(PROBE_URL, () => HttpResponse.json({})));
  configureTransport({
    authHeaders: () => ({ Authorization: "Bearer host-token" }),
  });

  await requestJson("/probe");

  expect(sentRequests[0]?.headers.get("Authorization")).toBe(
    "Bearer host-token",
  );
});
