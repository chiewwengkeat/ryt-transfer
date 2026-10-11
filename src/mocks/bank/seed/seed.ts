import {
  TransferDirection,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  directoryEntryFor,
  DUITNOW_BANKS,
} from "@/mocks/bank/directory/directory";
import {
  malaysianIsoDate,
  toMalaysiaIso,
} from "@/mocks/bank/malaysia-time/malaysia-time";
import type { BankTransferRecord } from "@/mocks/bank/state/state";

export const DEMO_PIN = "246810";
export const DEMO_PIN_ATTEMPTS = 3;
export const DEMO_CUSTOMER = {
  customerId: "cus_4f7e2a91",
  accountId: "100248813377",
};
export const SEED_BALANCE_MINOR = 1_284_550;

// mulberry32
export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Final states only, all before the anchor's Malaysian midnight, so the anchor day starts with
// its whole limit unused and nothing seeded is ever still in flight.
export function seedTransferHistory(
  anchorMs: number,
  transferCount: number,
  spanDays: number,
): BankTransferRecord[] {
  const nextRandom = createSeededRandom(HISTORY_SEED);
  const randomDigits = (length: number) =>
    Array.from({ length }, () => Math.floor(nextRandom() * 10)).join("");
  const pickRandom = <T>(list: readonly T[]) =>
    list[Math.floor(nextRandom() * list.length)]!;

  const regularCounterparties = Array.from({ length: 30 }, (_, index) => {
    const id = drawRegularCounterpartyId(index, pickRandom, randomDigits);
    const entry = directoryEntryFor(id);
    return {
      counterpartyId: { ...id, bankCode: entry.bankCode },
      counterparty: {
        registeredName: entry.registeredName,
        idType: entry.idType,
        idValueMasked: entry.idValueMasked,
        bankName: entry.bankName,
      },
    };
  });

  const anchorMidnightMs = Date.parse(
    `${malaysianIsoDate(anchorMs)}T00:00:00+08:00`,
  );
  return Array.from({ length: transferCount }, () => {
    // Squaring the draw favours the first regulars, so recent recipients repeat.
    const regular =
      regularCounterparties[
        Math.floor(nextRandom() ** 2 * regularCounterparties.length)
      ]!;
    const createdAtMs =
      anchorMidnightMs -
      (1 + Math.floor(nextRandom() * spanDays)) * DAY_MS +
      Math.floor((7 + nextRandom() * 16) * HOUR_MS);
    const ringgit =
      nextRandom() < 0.85
        ? 5 + Math.floor(nextRandom() * 145)
        : 150 + Math.floor(nextRandom() * 1350);
    const outcomeDraw = nextRandom();
    const note = nextRandom() < 0.4 ? pickRandom(NOTES) : undefined;
    return {
      transfer: {
        transferId: `trf_${Math.floor(nextRandom() * 2 ** 52).toString(16)}`,
        version: 3,
        ...SEEDED_OUTCOMES.find(({ drawBelow }) => outcomeDraw < drawBelow)!
          .outcome,
        counterparty: regular.counterparty,
        amount: {
          minor:
            ringgit * 100 +
            (nextRandom() < 0.5 ? 0 : Math.floor(nextRandom() * 100)),
          currency: "MYR",
        },
        ...(note && { note }),
        reference: `${malaysianIsoDate(createdAtMs).replace(/-/g, "")}${randomDigits(8)}`,
        createdAt: toMalaysiaIso(createdAtMs),
        updatedAt: toMalaysiaIso(createdAtMs + 3000),
      },
      createdAtMs,
      counterpartyId: regular.counterpartyId,
    };
  });
}

const HISTORY_SEED = 0x5eed2026;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOTES = [
  "Lunch",
  "Dinner split",
  "Groceries",
  "Rent",
  "Petrol",
  "Birthday gift",
  "Movie tickets",
  "Badminton court",
  "Car pool",
  "Durian",
  "Tuition fees",
  "Phone bill",
  "Thanks",
  "Teh tarik",
  "Wedding gift",
  "Duit raya",
];
const SEEDED_OUTCOMES = [
  {
    drawBelow: 0.25,
    outcome: {
      direction: TransferDirection.In,
      status: TransferStatus.Completed,
      funds: TransferFunds.Credited,
    },
  },
  {
    drawBelow: 0.96,
    outcome: {
      direction: TransferDirection.Out,
      status: TransferStatus.Completed,
      funds: TransferFunds.Debited,
    },
  },
  {
    drawBelow: 0.985,
    outcome: {
      direction: TransferDirection.Out,
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.Refunded,
      failureReason: TransferFailureReason.RecipientBankRejected,
    },
  },
  {
    drawBelow: 1,
    outcome: {
      direction: TransferDirection.Out,
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.NotDebited,
      failureReason: TransferFailureReason.InsufficientFunds,
    },
  },
];

function drawRegularCounterpartyId(
  index: number,
  pickRandom: <T>(list: readonly T[]) => T,
  randomDigits: (length: number) => string,
) {
  if (index % 6 < 3) {
    return {
      idType: RecipientIdType.Mobile,
      idValue: `+601${pickRandom([..."012346789"])}${randomDigits(7)}`,
    };
  }
  if (index % 6 === 3) {
    return { idType: RecipientIdType.Nric, idValue: randomDigits(12) };
  }
  if (index % 6 === 4) {
    return {
      idType: RecipientIdType.AccountNumber,
      idValue: randomDigits(12),
      bankCode: pickRandom(DUITNOW_BANKS).bankCode,
    };
  }
  return { idType: RecipientIdType.Brn, idValue: `2019${randomDigits(8)}` };
}
