export enum TransportErrorKind {
  Timeout = "timeout",
  Network = "network",
  Http = "http",
  Aborted = "aborted",
  // A 2xx that could not be read: the server acted on it, so never treat it as a refusal.
  Unreadable = "unreadable",
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

// The session-ended view shows and reports the session's end, so a request it failed is no failure of its own.
export function isSessionEndFailure(error: unknown) {
  return (
    error instanceof TransportError &&
    error.kind === TransportErrorKind.Http &&
    error.status === 401
  );
}
