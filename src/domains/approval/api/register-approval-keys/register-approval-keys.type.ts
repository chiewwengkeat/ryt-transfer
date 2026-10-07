export interface RegisterApprovalKeysRequest {
  // Base64 SPKI DER of an EC P-256 key, as the phone's key store exports it.
  possessionPublicKey?: string;
  biometricPublicKey?: string;
  // Needed only once keys are on file; the first pairing registers without it.
  pin?: string;
}

export interface RegisterApprovalKeysResponse {
  possessionKeyId?: string;
  biometricKeyId?: string;
}

export enum RegisterApprovalKeysErrorCode {
  PinRequired = "PIN_REQUIRED",
  PinIncorrect = "PIN_INCORRECT",
  PinLocked = "PIN_LOCKED",
  IdempotencyKeyReused = "IDEMPOTENCY_KEY_REUSED",
  RequestInProgress = "REQUEST_IN_PROGRESS",
  InvalidRequest = "INVALID_REQUEST",
}

export interface RegisterApprovalKeysErrorResponse {
  error:
    | {
        code: RegisterApprovalKeysErrorCode.PinIncorrect;
        message: string;
        attemptsRemaining: number;
      }
    | {
        code: Exclude<
          RegisterApprovalKeysErrorCode,
          RegisterApprovalKeysErrorCode.PinIncorrect
        >;
        message: string;
      };
}
