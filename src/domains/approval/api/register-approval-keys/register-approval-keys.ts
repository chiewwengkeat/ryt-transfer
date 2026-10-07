import { requestJson } from "@/shared/http/transport";

import type {
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
