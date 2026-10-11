import { resetDemoBank } from "@/mocks/bank/bank";
import { bindBankPorts } from "@/mocks/bank/ports/ports";
import { createSeededRandom } from "@/mocks/bank/seed/seed";

beforeEach(() => {
  // Bound fresh per test: shared randomness makes ids and challenges depend on test order.
  bindBankPorts(createJestBankPorts());
  return resetDemoBank();
});

const JEST_BANK_ANCHOR_MS = Date.parse("2026-10-07T09:30:00+08:00");

function createJestBankPorts() {
  const nextRandom = createSeededRandom(0x7e57);
  let savedSnapshot: string | null = null;
  return {
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
}
