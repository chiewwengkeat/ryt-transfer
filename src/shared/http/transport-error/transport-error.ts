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

export function isUnansweredReadFailure(error: unknown) {
  return (
    error instanceof TransportError &&
    (error.kind === TransportErrorKind.Network ||
      error.kind === TransportErrorKind.Timeout ||
      (error.kind === TransportErrorKind.Http && (error.status ?? 0) >= 500))
  );
}

export function isUnansweredWriteFailure(error: unknown) {
  return (
    error instanceof TransportError &&
    (error.kind === TransportErrorKind.Network ||
      error.kind === TransportErrorKind.Timeout ||
      error.kind === TransportErrorKind.Unreadable ||
      // A server error naming no error code says nothing about the write, which may have run.
      (error.kind === TransportErrorKind.Http &&
        (error.status ?? 0) >= 500 &&
        error.code === undefined))
  );
}
