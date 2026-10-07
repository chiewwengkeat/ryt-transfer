import { delay } from "msw";

import {
  bankError,
  httpResponseFrom,
  type BankAnswer,
} from "@/mocks/bank/answers";
import { answerOncePerKey } from "@/mocks/bank/idempotency";
import { advanceBankTransfers } from "@/mocks/bank/settlement";
import { persistBankState } from "@/mocks/bank/state";

type BankOperation = (call: {
  body: Record<string, unknown>;
  nowMs: number;
}) => BankAnswer;

async function answerFromBank(
  request: Request,
  operate: BankOperation,
  isWrite: boolean,
) {
  await delay();
  const rawBody = await request.text();
  // Everything below is synchronous: no other request can land between expiry and execution.
  const nowMs = Date.now();
  advanceBankTransfers(nowMs);
  const answerRequest = () => {
    let body: unknown = {};
    try {
      if (rawBody !== "") body = JSON.parse(rawBody);
    } catch {
      body = undefined;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return bankError(
        400,
        "INVALID_REQUEST",
        "The request body must be a JSON object.",
      );
    }
    return operate({ body: body as Record<string, unknown>, nowMs });
  };
  const answer = isWrite
    ? answerOncePerKey(
        {
          idempotencyKey: request.headers.get("Idempotency-Key"),
          fingerprint: `${request.method} ${new URL(request.url).pathname} ${rawBody}`,
          nowMs,
        },
        answerRequest,
      )
    : answerRequest();
  persistBankState();
  return httpResponseFrom(answer);
}

export function answerBankRead(request: Request, operate: BankOperation) {
  return answerFromBank(request, operate, false);
}

export function answerBankWrite(request: Request, operate: BankOperation) {
  return answerFromBank(request, operate, true);
}
