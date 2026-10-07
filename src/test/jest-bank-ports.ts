import { createSeededRandom } from "@/mocks/bank/seed";

const nextRandom = createSeededRandom(0x7e57);
let savedSnapshot: string | null = null;

export const JEST_BANK_ANCHOR_MS = Date.parse("2026-10-07T09:30:00+08:00");

export const jestBankPorts = {
  storage: {
    read: () => savedSnapshot,
    write: (snapshot: string) => {
      savedSnapshot = snapshot;
    },
  },
  randomBytes: (count: number) =>
    Uint8Array.from({ length: count }, () => Math.floor(nextRandom() * 256)),
  seed: {
    anchorMs: () => JEST_BANK_ANCHOR_MS,
    transferCount: 45,
    spanDays: 15,
  },
};
