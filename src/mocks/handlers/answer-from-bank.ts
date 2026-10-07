import { delay } from "msw";

import {
  bankError,
  httpResponseFrom,
  type BankAnswer,
} from "@/mocks/bank/answers";
import { answerOncePerKey } from "@/mocks/bank/idempotency";
import { advanceBankTransfers } from "@/mocks/bank/settlement";
import { persistBankState } from "@/mocks/bank/state";

async function answerFromBank(
  request: Request,
  answerAt: (rawBody: string, nowMs: number) => BankAnswer,
) {
  await delay();
  const rawBody = await request.text();
  // Everything below is synchronous: no other request can land between expiry and execution.
  const nowMs = Date.now();
  advanceBankTransfers(nowMs);
  const answer = answerAt(rawBody, nowMs);
  persistBankState();
  return httpResponseFrom(answer);
}

function jsonObjectIn(rawBody: string) {
  let parsed: unknown = {};
  try {
    if (rawBody !== "") parsed = JSON.parse(rawBody);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

// No refusal here: not every read's contract has a code for a malformed body.
export function answerBankRead(request: Request, operate: BankOperation) {
  return answerFromBank(request, (rawBody, nowMs) =>
    operate({ body: jsonObjectIn(rawBody) ?? {}, nowMs }),
  );
}

export function answerBankWrite(
  request: Request,
  operate: BankOperation,
  codes: { InvalidRequest: string; IdempotencyKeyReused: string },
) {
  return answerFromBank(request, (rawBody, nowMs) =>
    answerOncePerKey(
      {
        idempotencyKey: request.headers.get("Idempotency-Key"),
        fingerprint: `${request.method} ${new URL(request.url).pathname} ${rawBody}`,
        nowMs,
      },
      codes,
      () => {
        const body = jsonObjectIn(rawBody);
        return body
          ? operate({ body, nowMs })
          : bankError(
              400,
              codes.InvalidRequest,
              "The request body must be a JSON object.",
            );
      },
    ),
  );
}

type BankOperation = (call: {
  body: Record<string, unknown>;
  nowMs: number;
}) => BankAnswer;
