import { requestJson } from "@/shared/http/transport/transport";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";

import type {
  RegisterApprovalKeysErrorResponse,
  RegisterApprovalKeysRequest,
  RegisterApprovalKeysResponse,
} from "./register-approval-keys.type";

export function registerApprovalKeys(
  request: RegisterApprovalKeysRequest,
  idempotencyKey: string,
) {
  return requestJson<RegisterApprovalKeysResponse>("/approval-keys", {
    method: "POST",
    body: request,
    idempotencyKey,
    timeoutMs: 15_000,
  });
}

export function readRegisterApprovalKeysRefusal(failure: unknown) {
  return failure instanceof TransportError &&
    failure.kind === TransportErrorKind.Http
    ? (failure.body as RegisterApprovalKeysErrorResponse | undefined)?.error
    : undefined;
}
