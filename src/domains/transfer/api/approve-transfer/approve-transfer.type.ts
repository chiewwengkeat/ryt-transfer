import type { CoolingOffReason } from "../create-transfer/create-transfer.type";
import type { Transfer } from "../get-transfer/get-transfer.type";

export interface ApproveTransferRequest {
  keyId: string;
  signature: string;
  pin?: string;
}

export interface ApproveTransferResponse {
  transfer: Transfer;
}

export enum ApproveTransferErrorCode {
  ApprovalExpired = "APPROVAL_EXPIRED",
  ApprovalInvalid = "APPROVAL_INVALID",
  PinIncorrect = "PIN_INCORRECT",
  PinLocked = "PIN_LOCKED",
  KeyNotRegistered = "KEY_NOT_REGISTERED",
  CoolingOff = "COOLING_OFF",
  AccountLocked = "ACCOUNT_LOCKED",
  TransferNotFound = "TRANSFER_NOT_FOUND",
  IdempotencyKeyReused = "IDEMPOTENCY_KEY_REUSED",
  RequestInProgress = "REQUEST_IN_PROGRESS",
  InvalidRequest = "INVALID_REQUEST",
}

export interface ApproveTransferErrorResponse {
  error:
    | {
        code: ApproveTransferErrorCode.PinIncorrect;
        message: string;
        attemptsRemaining: number;
      }
    | {
        code: ApproveTransferErrorCode.CoolingOff;
        message: string;
        until: string;
        reason: CoolingOffReason;
      }
    | {
        code: Exclude<
          ApproveTransferErrorCode,
          | ApproveTransferErrorCode.PinIncorrect
          | ApproveTransferErrorCode.CoolingOff
        >;
        message: string;
      };
}
