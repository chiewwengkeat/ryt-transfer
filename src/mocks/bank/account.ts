import {
  TransferDirection,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";

import { bankError, wireMoney, type BankAnswer } from "./answers";
import { malaysianDate, toMalaysiaIso } from "./malaysia-time";
import { DEMO_CUSTOMER } from "./seed";
import { activeBankConditions, bankState } from "./state";

const DEFAULT_DAILY_LIMIT_MINOR = 500_000;
export const PER_TRANSFER_MAX_MINOR = 5_000_000;

export function transferLimitsAt(nowMs: number) {
  const today = malaysianDate(nowMs);
  // Only transfers made through this bank can fall on today: the seeded history ends before it.
  const usedMinor = bankState()
    .transfers.filter(
      ({ transfer, createdAtMs }) =>
        transfer.direction === TransferDirection.Out &&
        (transfer.status === TransferStatus.Processing ||
          transfer.status === TransferStatus.Completed) &&
        malaysianDate(createdAtMs) === today,
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
  Codes extends { AccountLocked: string; CoolingOff: string },
>(nowMs: number, codes: Codes) {
  const { accountLocked, coolingOff, activatedAtMs } = activeBankConditions();
  if (accountLocked) {
    return bankError(403, codes.AccountLocked, "The account is locked.");
  }
  const coolingOffEndsAtMs =
    activatedAtMs + (coolingOff?.endsAfterActivationMs ?? 0);
  if (coolingOff && nowMs < coolingOffEndsAtMs) {
    return bankError(
      403,
      codes.CoolingOff,
      "Transfers wait out a security cooling-off period.",
      { until: toMalaysiaIso(coolingOffEndsAtMs), reason: coolingOff.reason },
    );
  }
  return undefined;
}

export function getBankPrimaryAccount(): BankAnswer {
  return {
    status: 200,
    body: { ...DEMO_CUSTOMER, balance: wireMoney(bankState().balanceMinor) },
  };
}

export function getBankTransferLimits({
  nowMs,
}: {
  nowMs: number;
}): BankAnswer {
  const { limitMinor, usedMinor, remainingMinor } = transferLimitsAt(nowMs);
  return {
    status: 200,
    body: {
      daily: {
        limit: wireMoney(limitMinor),
        usedToday: wireMoney(usedMinor),
        remaining: wireMoney(remainingMinor),
      },
      perTransferMax: wireMoney(PER_TRANSFER_MAX_MINOR),
    },
  };
}
