import { API_BASE_URL } from "@/shared/config/config";
import { reportError } from "@/shared/observability/observability/observability";
import { reportRequestOutcome } from "@/shared/platform/offline/offline";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";

export type Send = (request: Request) => Promise<Response>;

export function configureTransport(
  options: { send?: Send; authHeaders?: () => Record<string, string> } = {},
) {
  configuredSend = options.send ?? sendWithFetch;
  authHeaders = options.authHeaders ?? withoutAuthHeaders;
}

// A 401 means only that the session ended.
export function addUnauthorizedListener(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export async function requestJson<Data>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
) {
  const { method = "GET", body, idempotencyKey, signal } = options;
  // Before the race: an abort that has already happened fires no event for it to hear.
  if (signal?.aborted) throw new TransportError(TransportErrorKind.Aborted);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;

  // Hermes leaves signal.reason undefined, so which abort fired is tracked here.
  const controller = new AbortController();
  // Built outside the race: a request that cannot be built is a bug, never a dropped connection.
  const request = new Request(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: controller.signal,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abortForCaller = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", abortForCaller);

  let response: Response;
  let text: string;
  let rejectOnAbort = () => {};
  try {
    // A raced promise, because the demo send answers whether or not the request was aborted.
    response = await new Promise<Response>((resolve, reject) => {
      rejectOnAbort = () => {
        reject(new Error("aborted"));
      };
      controller.signal.addEventListener("abort", rejectOnAbort);
      configuredSend(request).then(resolve, reject);
    });
    text = await response.text();
  } catch {
    const failure = !controller.signal.aborted
      ? TransportErrorKind.Network
      : timedOut
        ? TransportErrorKind.Timeout
        : TransportErrorKind.Aborted;
    reportRequestOutcome(`${method} ${path}`, failure);
    throw new TransportError(failure);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortForCaller);
    // Removed by hand: Node's Request keeps its signal alive until the request is collected, and this listener holds the request.
    controller.signal.removeEventListener("abort", rejectOnAbort);
  }

  // An error status or an unreadable body still proves the bank was reached.
  reportRequestOutcome(`${method} ${path}`);
  if (response.ok) {
    try {
      return JSON.parse(text) as Data;
    } catch {
      throw new TransportError(TransportErrorKind.Unreadable, response.status);
    }
  }
  if (response.status === 401) {
    for (const listener of unauthorizedListeners) {
      try {
        listener();
      } catch (listenerFailure) {
        // Reported, not thrown: the caller is owed the 401, and the other listeners still run.
        reportError(listenerFailure, { boundary: "unauthorized_listener" });
      }
    }
  }
  let errorBody: unknown;
  try {
    errorBody = JSON.parse(text);
  } catch {
    // A proxy's error page is not JSON; its status still says what happened.
  }
  // Every endpoint shares this envelope; each narrows the code to its own union.
  const errorCode = (
    errorBody as { error?: { code?: unknown } } | null | undefined
  )?.error?.code;
  throw new TransportError(
    TransportErrorKind.Http,
    response.status,
    typeof errorCode === "string" ? errorCode : undefined,
    errorBody,
  );
}

const DEFAULT_TIMEOUT_MS = 10_000;

// An arrow, not fetch itself: called unbound fetch can throw, and msw swaps the global after load.
const sendWithFetch: Send = (request) => fetch(request);
const withoutAuthHeaders = () => ({});

let configuredSend = sendWithFetch;
let authHeaders: () => Record<string, string> = withoutAuthHeaders;
const unauthorizedListeners = new Set<() => void>();
