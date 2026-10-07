import { bankError, type BankAnswer } from "./answers";
import { bankState } from "./state";

const FIRST_ANSWER_KEPT_MS = 24 * 60 * 60 * 1000;

// Errors are kept too: a resent wrong PIN must replay its 422, not spend another attempt.
export function answerOncePerKey(
  write: { idempotencyKey: string | null; fingerprint: string; nowMs: number },
  operate: () => BankAnswer,
) {
  if (!write.idempotencyKey) {
    return bankError(
      400,
      "INVALID_REQUEST",
      "Every write needs an Idempotency-Key header.",
    );
  }
  const { firstAnswers } = bankState();
  for (const [key, first] of Object.entries(firstAnswers)) {
    if (write.nowMs - first.answeredAtMs >= FIRST_ANSWER_KEPT_MS) {
      delete firstAnswers[key];
    }
  }

  const first = firstAnswers[write.idempotencyKey];
  if (first) {
    return first.fingerprint === write.fingerprint
      ? first.answer
      : bankError(
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was first sent with a different request.",
        );
  }
  const answer = operate();
  firstAnswers[write.idempotencyKey] = {
    fingerprint: write.fingerprint,
    answer,
    answeredAtMs: write.nowMs,
  };
  return answer;
}
