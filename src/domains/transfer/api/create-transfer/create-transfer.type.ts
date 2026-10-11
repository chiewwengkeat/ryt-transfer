import type { Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { WireMoney } from "@/shared/lib/money/money";

export interface CreateTransferRequest {
  recipientRef: string;
  amount: WireMoney;
  note?: string;
}

export interface CreateTransferResponse {
  transfer: Transfer;
  approval: { challenge: string; expiresInSeconds: number };
}

export enum CreateTransferErrorCode {
  InsufficientFunds = "INSUFFICIENT_FUNDS",
  DailyLimitExceeded = "DAILY_LIMIT_EXCEEDED",
  AbovePerTransferMax = "ABOVE_PER_TRANSFER_MAX",
  AmountInvalid = "AMOUNT_INVALID",
  NoteInvalid = "NOTE_INVALID",
  RecipientRefExpired = "RECIPIENT_REF_EXPIRED",
  CoolingOff = "COOLING_OFF",
  AccountLocked = "ACCOUNT_LOCKED",
  ServiceUnavailable = "SERVICE_UNAVAILABLE",
  IdempotencyKeyReused = "IDEMPOTENCY_KEY_REUSED",
  RequestInProgress = "REQUEST_IN_PROGRESS",
  InvalidRequest = "INVALID_REQUEST",
}

export enum CoolingOffReason {
  DevicePaired = "DEVICE_PAIRED",
  NewAccount = "NEW_ACCOUNT",
}

export interface CreateTransferErrorResponse {
  error:
    | {
        code: CreateTransferErrorCode.CoolingOff;
        message: string;
        until: string;
        reason: CoolingOffReason;
      }
    | {
        code: CreateTransferErrorCode.ServiceUnavailable;
        message: string;
        until?: string;
      }
    | {
        code: Exclude<
          CreateTransferErrorCode,
          | CreateTransferErrorCode.CoolingOff
          | CreateTransferErrorCode.ServiceUnavailable
        >;
        message: string;
      };
}
