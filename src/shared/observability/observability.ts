import { TransportError } from "@/shared/http/transport";

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
]);

let sink: ObservabilitySink | null = __DEV__
  ? (record) => {
      console.info(`[${record.type}] ${record.name}`, record.properties);
    }
  : null;

export function setObservabilitySink(nextSink: ObservabilitySink | null) {
  sink = nextSink;
}

export function trackEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  sink?.({ type: "event", name, properties: redactProperties(properties) });
}

// Never the message: it can quote whatever the code that threw had in hand.
export function reportError(
  error: unknown,
  properties: Record<string, unknown> = {},
) {
  sink?.({
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

export type ObservabilitySink = (record: ObservedRecord) => void;

export interface ObservedRecord {
  type: "event" | "error";
  name: string;
  properties: Record<string, string | number | boolean | null>;
}
