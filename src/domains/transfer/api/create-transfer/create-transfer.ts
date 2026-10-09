import { useMutation } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport/transport";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";

import type {
  CreateTransferErrorResponse,
  CreateTransferRequest,
  CreateTransferResponse,
} from "./create-transfer.type";

export function readCreateTransferRefusal(failure: unknown) {
  return failure instanceof TransportError &&
    failure.kind === TransportErrorKind.Http
    ? (failure.body as CreateTransferErrorResponse | undefined)?.error
    : undefined;
}

export function isCreateTransferUnanswered(error: unknown) {
  return (
    error instanceof TransportError &&
    (error.kind === TransportErrorKind.Network ||
      error.kind === TransportErrorKind.Timeout ||
      error.kind === TransportErrorKind.Unreadable ||
      // A server error naming no bank code says nothing about the create, which may have run.
      (error.kind === TransportErrorKind.Http &&
        (error.status ?? 0) >= 500 &&
        error.code === undefined))
  );
}

export function useCreateTransfer() {
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      request: CreateTransferRequest;
      idempotencyKey: string;
    }) =>
      requestJson<CreateTransferResponse>("/transfers", {
        method: "POST",
        body: request,
        idempotencyKey,
        timeoutMs: 15_000,
      }),
    // Repeated, though writes default to none: creating moves no money, and the key keeps repeats to one transfer.
    retry: (failureCount, error) =>
      failureCount < 2 && isCreateTransferUnanswered(error),
    retryDelay: (failureCount) => (failureCount + 1) * 2_000,
  });
}
