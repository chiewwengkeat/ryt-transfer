import { TransportError } from "@/shared/http/transport-error/transport-error";
import type { Send } from "@/shared/http/transport/transport";

export function setObservabilitySink(nextSink: ObservabilitySink | null) {
  sink = nextSink;
}

export function trackEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  sendToSinkIgnoringItsFailure({
    type: "event",
    name,
    properties: redactProperties(properties),
  });
}

// Never the message: it can quote whatever the code that threw had in hand.
export function reportError(
  error: unknown,
  properties: Record<string, unknown> = {},
) {
  sendToSinkIgnoringItsFailure({
    type: "error",
    name: error instanceof Error ? error.name : typeof error,
    properties: redactProperties(
      error instanceof TransportError
        ? {
            ...properties,
            errorKind: error.kind,
            httpStatus: error.status,
            errorCode: error.code,
          }
        : properties,
    ),
  });
}

export const logRequestsInDevelopment =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? wrapSendInConsoleLog
    : (send: Send) => send;

export type ObservabilitySink = (record: ObservedRecord) => void;

export interface ObservedRecord {
  type: "event" | "error";
  name: string;
  properties: Record<string, string | number | boolean | null>;
}

// An allow-list, so nothing unvetted reaches a sink: credentials and personal data never pass; amounts may, in sen.
const ALLOWED_PROPERTY_NAMES = new Set([
  "scenario",
  "step",
  "outcome",
  "method",
  "attempt",
  "count",
  "amountMinor",
  "currency",
  "boundary",
  "errorKind",
  "httpStatus",
  "errorCode",
  "path",
]);
const CREDENTIAL_KEYS = new Set(["pin", "signature"]);

let sink: ObservabilitySink | null = __DEV__
  ? (record) => {
      console.info(`[${record.type}] ${record.name}`, record.properties);
    }
  : null;

function sendToSinkIgnoringItsFailure(record: ObservedRecord) {
  try {
    sink?.(record);
  } catch {
    // Swallowed: a broken sink's throw would replace the caller's own result or failure.
  }
}

function redactProperties(properties: Record<string, unknown>) {
  const allowed: ObservedRecord["properties"] = {};
  for (const [name, value] of Object.entries(properties)) {
    if (
      ALLOWED_PROPERTY_NAMES.has(name) &&
      (value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    )
      allowed[name] = value;
  }
  return allowed;
}

function wrapSendInConsoleLog(send: Send): Send {
  return async (request) => {
    const { pathname, search } = new URL(request.url);
    const title = `[request] ${request.method} ${pathname}${search}`;
    const requestBody = parseMaskingCredentials(await request.clone().text());
    let response: Response;
    try {
      response = await send(request);
    } catch (failure) {
      console.info(`${title} failed`, { request: requestBody, failure });
      throw failure;
    }
    console.info(`${title} ${response.status}`, {
      request: requestBody,
      response: parseMaskingCredentials(await response.clone().text()),
    });
    return response;
  };
}

function parseMaskingCredentials(body: string): unknown {
  if (body === "") return undefined;
  try {
    return JSON.parse(body, (key, value: unknown) =>
      CREDENTIAL_KEYS.has(key) ? "[masked]" : value,
    );
  } catch {
    return body;
  }
}
