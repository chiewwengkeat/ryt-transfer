import { useMutation } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";

import type {
  CreateTransferRequest,
  CreateTransferResponse,
} from "./create-transfer.type";

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
  });
}
