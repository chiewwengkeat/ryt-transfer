import { useMutation } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";

import type {
  CreateTransferRequest,
  CreateTransferResponse,
} from "./create-transfer.type";

export function isCreateTransferUnanswered(error: unknown) {
  return (
    error instanceof TransportError &&
    (error.kind === TransportErrorKind.Network ||
      error.kind === TransportErrorKind.Timeout ||
      error.kind === TransportErrorKind.Unreadable)
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
