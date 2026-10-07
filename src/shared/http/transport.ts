import { API_BASE_URL } from "@/shared/config/config";

export type Send = (request: Request) => Promise<Response>;

// The demo layer's module shape lives here: the shell may not import even a type from src/mocks.
export interface DemoLayer {
  demoSend: Send;
}

export enum TransportErrorKind {
  Timeout = "timeout",
  Network = "network",
  Http = "http",
  Aborted = "aborted",
}

export class TransportError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    readonly status?: number,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(status === undefined ? kind : `${kind} ${status}`);
    this.name = "TransportError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

// An arrow, not fetch itself: called unbound fetch can throw, and msw swaps the global after load.
const sendWithFetch: Send = (request) => fetch(request);
const withoutAuthHeaders = () => ({});

let configuredSend = sendWithFetch;
let authHeaders: () => Record<string, string> = withoutAuthHeaders;
const unauthorizedListeners = new Set<() => void>();

export function configureTransport(
  options: { send?: Send; authHeaders?: () => Record<string, string> } = {},
) {
  configuredSend = options.send ?? sendWithFetch;
  authHeaders = options.authHeaders ?? withoutAuthHeaders;
}

// A 401 means only that the session ended: the shell shows that, so no screen handles it too.
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
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;

  // Hermes leaves signal.reason undefined, so which abort fired is tracked here.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abortForCaller = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", abortForCaller);
  if (signal?.aborted) controller.abort();

  let response: Response;
  let text: string;
  try {
    // A raced promise, because the demo send answers whether or not the request was aborted.
    response = await new Promise<Response>((resolve, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new Error("aborted"));
      });
      configuredSend(
        new Request(`${API_BASE_URL}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        }),
      ).then(resolve, reject);
    });
    text = await response.text();
  } catch {
    if (!controller.signal.aborted)
      throw new TransportError(TransportErrorKind.Network);
    throw new TransportError(
      timedOut ? TransportErrorKind.Timeout : TransportErrorKind.Aborted,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortForCaller);
  }

  if (response.ok) return JSON.parse(text) as Data;
  if (response.status === 401)
    for (const listener of unauthorizedListeners) listener();
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
