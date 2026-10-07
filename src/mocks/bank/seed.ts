import {
  TransferDirection,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";

import { wireMoney } from "./answers";
import { directoryEntryFor, DUITNOW_BANKS } from "./directory";
import { malaysianDate, toMalaysiaIso } from "./malaysia-time";
import type { BankTransferRecord } from "./state";

export const DEMO_PIN = "246810";
export const DEMO_PIN_ATTEMPTS = 3;
export const DEMO_CUSTOMER = {
  customerId: "cus_4f7e2a91",
  accountId: "100248813377",
};
export const SEED_BALANCE_MINOR = 1_284_550;

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
  const random = createSeededRandom(HISTORY_SEED);
  const digits = (length: number) =>
    Array.from({ length }, () => Math.floor(random() * 10)).join("");
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(random() * list.length)]!;

  const regulars = Array.from({ length: 30 }, (_, index) => {
    const id =
      index % 6 < 3
        ? {
            idType: RecipientIdType.Mobile,
            idValue: `+601${pick([..."012346789"])}${digits(7)}`,
          }
        : index % 6 === 3
          ? { idType: RecipientIdType.Nric, idValue: digits(12) }
          : index % 6 === 4
            ? {
                idType: RecipientIdType.AccountNumber,
                idValue: digits(12),
                bankCode: pick(DUITNOW_BANKS).bankCode,
              }
            : { idType: RecipientIdType.Brn, idValue: `2019${digits(8)}` };
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
    `${malaysianDate(anchorMs)}T00:00:00+08:00`,
  );
  return Array.from({ length: transferCount }, () => {
    // Squaring the draw favours the first regulars, so recent recipients repeat.
    const regular = regulars[Math.floor(random() ** 2 * regulars.length)]!;
    const createdAtMs =
      anchorMidnightMs -
      (1 + Math.floor(random() * spanDays)) * DAY_MS +
      Math.floor((7 + random() * 16) * HOUR_MS);
    const ringgit =
      random() < 0.85
        ? 5 + Math.floor(random() * 145)
        : 150 + Math.floor(random() * 1350);
    const outcomeDraw = random();
    const note = random() < 0.4 ? pick(NOTES) : undefined;
    return {
      transfer: {
        transferId: `trf_${Math.floor(random() * 2 ** 52).toString(16)}`,
        version: 3,
        ...SEEDED_OUTCOMES.find(({ drawBelow }) => outcomeDraw < drawBelow)!
          .outcome,
        counterparty: regular.counterparty,
        amount: wireMoney(
          ringgit * 100 + (random() < 0.5 ? 0 : Math.floor(random() * 100)),
        ),
        ...(note && { note }),
        reference: `${malaysianDate(createdAtMs).replace(/-/g, "")}${digits(8)}`,
        createdAt: toMalaysiaIso(createdAtMs),
        updatedAt: toMalaysiaIso(createdAtMs + 3000),
      },
      createdAtMs,
      counterpartyId: regular.counterpartyId,
    };
  });
}
