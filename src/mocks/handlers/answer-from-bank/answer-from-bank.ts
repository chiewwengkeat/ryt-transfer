import { delay } from "msw";

import {
  bankError,
  httpResponseFrom,
  type BankAnswer,
} from "@/mocks/bank/answers/answers";
import { advanceBankTransfers } from "@/mocks/bank/settlement/settlement";
import { bankState, persistBankState } from "@/mocks/bank/state/state";

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

type BankOperation = (call: {
  body: Record<string, unknown>;
  nowMs: number;
}) => BankAnswer;

const FIRST_ANSWER_KEPT_MS = 24 * 60 * 60 * 1000;

// Errors are kept too: a resent wrong PIN must replay its 422, not spend another attempt.
function answerOncePerKey(
  write: { idempotencyKey: string | null; fingerprint: string; nowMs: number },
  codes: { InvalidRequest: string; IdempotencyKeyReused: string },
  operate: () => BankAnswer,
) {
  if (!write.idempotencyKey) {
    return bankError(
      400,
      codes.InvalidRequest,
      "Every write needs an Idempotency-Key header.",
    );
  }
  const { firstAnswers } = bankState();
  for (const [key, first] of Object.entries(firstAnswers)) {
    if (write.nowMs - first.answeredAtMs >= FIRST_ANSWER_KEPT_MS) {
      delete firstAnswers[key];
    }
  }

  const first = Object.hasOwn(firstAnswers, write.idempotencyKey)
    ? firstAnswers[write.idempotencyKey]
    : undefined;
  if (first) {
    return first.fingerprint === write.fingerprint
      ? first.answer
      : bankError(
          409,
          codes.IdempotencyKeyReused,
          "This Idempotency-Key was first sent with a different request.",
        );
  }
  const answer = operate();
  // Defined, not assigned: assigning a key named __proto__ replaces the prototype instead.
  Object.defineProperty(firstAnswers, write.idempotencyKey, {
    value: {
      fingerprint: write.fingerprint,
      answer,
      answeredAtMs: write.nowMs,
    },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return answer;
}
