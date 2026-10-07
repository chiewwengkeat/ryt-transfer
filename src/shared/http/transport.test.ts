import { delay, http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/shared/config/config";
import { observedRecords } from "@/test/harness/recording-sink";
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
  jest.useRealTimers();
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

it.each([
  {
    answer: "a page that is not JSON",
    status: 200,
    respond: () => HttpResponse.text("<html>Sign in to this Wi-Fi</html>"),
  },
  {
    answer: "no body",
    status: 204,
    respond: () => new HttpResponse(null, { status: 204 }),
  },
])(
  "rejects a $status with $answer as unreadable, never as a refusal",
  async ({ status, respond }) => {
    mswServer.use(http.post(PROBE_URL, respond));

    const failure = requestJson("/probe", { method: "POST", body: {} });

    await expect(failure).rejects.toBeInstanceOf(TransportError);
    await expect(failure).rejects.toMatchObject({
      kind: TransportErrorKind.Unreadable,
      status,
    });
  },
);

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

it("keeps the 401 when a session-ended listener breaks, and still tells the others", async () => {
  mswServer.use(
    http.get(PROBE_URL, () => new HttpResponse(null, { status: 401 })),
  );
  const stopBrokenListener = addUnauthorizedListener(() => {
    throw new Error("listener broke");
  });
  const heard = jest.fn();
  const stopListening = addUnauthorizedListener(heard);

  await expect(requestJson("/probe")).rejects.toMatchObject({
    kind: TransportErrorKind.Http,
    status: 401,
  });
  stopBrokenListener();
  stopListening();

  expect(heard).toHaveBeenCalledTimes(1);
  expect(observedRecords).toContainEqual({
    type: "error",
    name: "Error",
    properties: { boundary: "unauthorized_listener" },
  });
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

it("gives up on a request at 10 s when its caller sets no timeout", async () => {
  jest.useFakeTimers();
  configureTransport({ send: () => new Promise<Response>(() => undefined) });

  const answer = requestJson("/probe");
  await jest.advanceTimersByTimeAsync(9_999);
  const justBeforeTenSeconds = await Promise.race([
    answer,
    Promise.resolve("still waiting"),
  ]);
  await jest.advanceTimersByTimeAsync(1);

  expect(justBeforeTenSeconds).toBe("still waiting");
  await expect(answer).rejects.toMatchObject({
    kind: TransportErrorKind.Timeout,
  });
});

it("sends nothing for a caller that gave up before the request left", async () => {
  const send = jest.fn(() => Promise.resolve(HttpResponse.json({})));
  configureTransport({ send });
  const caller = new AbortController();
  caller.abort();

  await expect(
    requestJson("/probe", { method: "POST", body: {}, signal: caller.signal }),
  ).rejects.toMatchObject({ kind: TransportErrorKind.Aborted });

  expect(send).not.toHaveBeenCalled();
});

it("fails a request that cannot be built as the bug it is, never as a dropped connection", async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  await expect(
    requestJson("/probe", { body: { amount: 5 } }),
  ).rejects.toMatchObject({ name: "TypeError" });
  await expect(
    requestJson("/probe", { method: "POST", body: circular }),
  ).rejects.toMatchObject({ name: "TypeError" });
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
  mswServer.use(
    http.get(PROBE_URL, () => HttpResponse.json({})),
    http.post(PROBE_URL, () => HttpResponse.json({})),
  );
  configureTransport({
    authHeaders: () => ({ Authorization: "Bearer host-token" }),
  });

  await requestJson("/probe");
  await requestJson("/probe", { method: "POST", body: {} });

  expect(
    sentRequests.map((request) => request.headers.get("Authorization")),
  ).toEqual(["Bearer host-token", "Bearer host-token"]);
});
