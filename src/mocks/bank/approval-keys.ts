import {
  RegisterApprovalKeysErrorCode,
  type RegisterApprovalKeysRequest,
} from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";

import { bankError, type BankAnswer } from "./answers";
import { randomHex } from "./ports";
import { DEMO_PIN, DEMO_PIN_ATTEMPTS } from "./seed";
import { bankState, notifyCustomer } from "./state";
import { isP256PublicKey } from "./verification";

// Shared by approve and key registration: one PIN, one attempt count, one lock.
export function refusalOfDemoPin(pin: string): BankAnswer | undefined {
  const state = bankState();
  if (state.pinAttemptsRemaining === 0) {
    return bankError(423, "PIN_LOCKED", "The PIN is locked.");
  }
  if (pin === DEMO_PIN) {
    state.pinAttemptsRemaining = DEMO_PIN_ATTEMPTS;
    return undefined;
  }
  state.pinAttemptsRemaining -= 1;
  return state.pinAttemptsRemaining === 0
    ? bankError(423, "PIN_LOCKED", "The PIN is locked.")
    : bankError(422, "PIN_INCORRECT", "The PIN is incorrect.", {
        attemptsRemaining: state.pinAttemptsRemaining,
      });
}

export function registerBankApprovalKeys({
  body,
  nowMs,
}: {
  body: Record<string, unknown>;
  nowMs: number;
}): BankAnswer {
  const { possessionPublicKey, biometricPublicKey, pin } =
    body as Partial<RegisterApprovalKeysRequest>;
  const offeredKeys = [
    { kind: "possession", spkiBase64: possessionPublicKey },
    { kind: "biometric", spkiBase64: biometricPublicKey },
  ] as const;
  const keys = offeredKeys.filter(({ spkiBase64 }) => spkiBase64 !== undefined);
  if (
    keys.length === 0 ||
    keys.some(
      ({ spkiBase64 }) =>
        typeof spkiBase64 !== "string" || !isP256PublicKey(spkiBase64),
    ) ||
    (pin !== undefined && typeof pin !== "string")
  ) {
    return bankError(
      400,
      RegisterApprovalKeysErrorCode.InvalidRequest,
      "Send at least one P-256 public key as base64 SubjectPublicKeyInfo.",
    );
  }

  const state = bankState();
  const replacesKeys = state.approvalKeys.length > 0;
  if (replacesKeys) {
    if (pin === undefined) {
      return bankError(
        403,
        RegisterApprovalKeysErrorCode.PinRequired,
        "Approval keys are already on file: changing them needs the PIN.",
      );
    }
    const refusal = refusalOfDemoPin(pin);
    if (refusal) return refusal;
  }

  const keyIds: Record<string, string> = {};
  for (const { kind, spkiBase64 } of keys) {
    const keyId = `key_${randomHex(8)}`;
    state.approvalKeys = [
      ...state.approvalKeys.filter((key) => key.kind !== kind),
      { keyId, kind, spkiBase64: spkiBase64!, registeredAtMs: nowMs },
    ];
    keyIds[`${kind}KeyId`] = keyId;
  }
  if (replacesKeys) {
    notifyCustomer(
      nowMs,
      "The way you approve transfers changed on your phone. If this wasn't you, lock your account.",
    );
  }
  return { status: 200, body: keyIds };
}
