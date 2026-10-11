import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import {
  TransferDirection,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { bankError, type BankAnswer } from "@/mocks/bank/answers/answers";
import {
  malaysianIsoDate,
  toMalaysiaIso,
} from "@/mocks/bank/malaysia-time/malaysia-time";
import { DEMO_CUSTOMER } from "@/mocks/bank/seed/seed";
import { activeBankConditions, bankState } from "@/mocks/bank/state/state";

export const PER_TRANSFER_MAX_MINOR = 5_000_000;

export function transferLimitsAt(nowMs: number) {
  const today = malaysianIsoDate(nowMs);
  // Only transfers made through this bank can fall on today: the seeded history ends before it.
  const usedMinor = bankState()
    .transfers.filter(
      ({ transfer, createdAtMs }) =>
        transfer.direction === TransferDirection.Out &&
        (transfer.status === TransferStatus.Processing ||
          transfer.status === TransferStatus.Completed) &&
        malaysianIsoDate(createdAtMs) === today,
    )
    .reduce((sum, { transfer }) => sum + transfer.amount.minor, 0);
  const limitMinor =
    activeBankConditions().dailyLimitMinor ?? DEFAULT_DAILY_LIMIT_MINOR;
  return {
    limitMinor,
    usedMinor,
    remainingMinor: Math.max(0, limitMinor - usedMinor),
  };
}

export function lockOrCoolingOffRefusal<
  AccountLocked extends string,
  CoolingOff extends string,
>(
  nowMs: number,
  codes: { AccountLocked: AccountLocked; CoolingOff: CoolingOff },
) {
  const { accountLocked, coolingOff, activatedAtMs } = activeBankConditions();
  if (accountLocked) {
    return bankError(403, codes.AccountLocked, "The account is locked.");
  }
  const coolingOffEndsAtMs =
    activatedAtMs + (coolingOff?.endsAfterActivationMs ?? 0);
  if (coolingOff && nowMs < coolingOffEndsAtMs) {
    return {
      status: 403,
      body: {
        error: {
          code: codes.CoolingOff,
          message: "Transfers wait out a security cooling-off period.",
          until: toMalaysiaIso(coolingOffEndsAtMs),
          reason: coolingOff.reason,
        },
      },
    };
  }
  return undefined;
}

export function getBankPrimaryAccount(): BankAnswer<GetPrimaryAccountResponse> {
  return {
    status: 200,
    body: {
      ...DEMO_CUSTOMER,
      balance: { minor: bankState().balanceMinor, currency: "MYR" },
    },
  };
}

export function getBankTransferLimits({
  nowMs,
}: {
  nowMs: number;
}): BankAnswer<GetTransferLimitsResponse> {
  const { limitMinor, usedMinor, remainingMinor } = transferLimitsAt(nowMs);
  return {
    status: 200,
    body: {
      daily: {
        limit: { minor: limitMinor, currency: "MYR" },
        usedToday: { minor: usedMinor, currency: "MYR" },
        remaining: { minor: remainingMinor, currency: "MYR" },
      },
      perTransferMax: { minor: PER_TRANSFER_MAX_MINOR, currency: "MYR" },
    },
  };
}

const DEFAULT_DAILY_LIMIT_MINOR = 500_000;
