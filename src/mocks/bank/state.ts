import type { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import type { Transfer } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type {
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  TRANSFER_SCENARIOS,
  type TransferScenario,
} from "@/mocks/scenarios/transfer-scenarios";
import {
  NO_SCENARIO_PICK,
  switcherStore,
} from "@/mocks/switcher/switcher-store";

import type { BankAnswer } from "./answers";
import { toMalaysiaIso } from "./malaysia-time";
import { bankPorts } from "./ports";
import {
  DEMO_PIN_ATTEMPTS,
  SEED_BALANCE_MINOR,
  seedTransferHistory,
} from "./seed";
import type { PendingTransferChange } from "./settlement";

const SNAPSHOT_FORMAT_VERSION = 1;

export interface BankTransferRecord {
  transfer: Transfer;
  createdAtMs: number;
  // Unmasked, so it never goes on the wire: recents and first-transfer checks match on it.
  counterpartyId: {
    idType: RecipientIdType;
    idValue: string;
    bankCode: string;
  };
  approval?: {
    challenge: string;
    expiresAtMs: number;
    signedDetails: Parameters<typeof buildSignedApprovalText>[0];
  };
  pendingChange?: { atMs: number; change: PendingTransferChange };
}

interface BankState {
  anchorMs: number;
  balanceMinor: number;
  transfers: BankTransferRecord[];
  recipientRefs: Record<
    string,
    {
      expiresAtMs: number;
      counterpartyId: BankTransferRecord["counterpartyId"];
      recipient: LookupRecipientResponse["recipient"];
    }
  >;
  firstAnswers: Record<
    string,
    { fingerprint: string; answer: BankAnswer; answeredAtMs: number }
  >;
  approvalKeys: {
    keyId: string;
    kind: "possession" | "biometric";
    spkiBase64: string;
    registeredAtMs: number;
  }[];
  pinAttemptsRemaining: number;
  notifications: { sentAt: string; message: string }[];
}

let loadedState: BankState | undefined;
// Rebuilt from the anchor on every load rather than saved: the anchor already determines it.
let seededTransfers: BankTransferRecord[] = [];

function installBankState(state: BankState) {
  const { transferCount, spanDays } = bankPorts().seed;
  loadedState = state;
  seededTransfers = seedTransferHistory(
    state.anchorMs,
    transferCount,
    spanDays,
  );
  return state;
}

function freshBankState(anchorMs: number): BankState {
  return {
    anchorMs,
    balanceMinor: SEED_BALANCE_MINOR,
    transfers: [],
    recipientRefs: {},
    firstAnswers: {},
    approvalKeys: [],
    pinAttemptsRemaining: DEMO_PIN_ATTEMPTS,
    notifications: [],
  };
}

export function bankState() {
  if (loadedState) return loadedState;

  const { storage, seed } = bankPorts();
  let snapshot: {
    formatVersion?: number;
    state?: BankState;
    scenarioPick?: { scenarioId?: unknown; activatedAtMs?: unknown };
  } | null;
  try {
    snapshot = JSON.parse(storage.read() ?? "null") as typeof snapshot;
  } catch {
    snapshot = null;
  }
  if (snapshot?.formatVersion !== SNAPSHOT_FORMAT_VERSION || !snapshot.state) {
    return installBankState(freshBankState(seed.anchorMs()));
  }

  // A pick saved by a build whose registry no longer has it falls back to no scenario.
  const { scenarioId, activatedAtMs } = snapshot.scenarioPick ?? {};
  switcherStore.setState(
    typeof scenarioId === "string" &&
      scenarioId in TRANSFER_SCENARIOS &&
      typeof activatedAtMs === "number"
      ? {
          scenarioId: scenarioId as keyof typeof TRANSFER_SCENARIOS,
          activatedAtMs,
        }
      : NO_SCENARIO_PICK,
  );
  return installBankState(snapshot.state);
}

export function persistBankState() {
  bankPorts().storage.write(
    JSON.stringify({
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      state: bankState(),
      scenarioPick: switcherStore.getState(),
    }),
  );
}

export function resetBankState() {
  installBankState(freshBankState(bankPorts().seed.anchorMs()));
  switcherStore.setState(NO_SCENARIO_PICK);
  persistBankState();
}

export function saveScenarioPick(
  pick: ReturnType<typeof switcherStore.getState>,
) {
  // Load first: a load after the pick would restore the saved one over it.
  bankState();
  switcherStore.setState(pick);
  persistBankState();
}

export function activeTransferScenario(): TransferScenario | undefined {
  // Loading restores a pick saved before a restart, so a cold start sees it too.
  bankState();
  const { scenarioId } = switcherStore.getState();
  return scenarioId === null ? undefined : TRANSFER_SCENARIOS[scenarioId];
}

export function activeBankConditions() {
  return {
    ...activeTransferScenario()?.conditions,
    activatedAtMs: switcherStore.getState().activatedAtMs,
  };
}

export function notifyCustomer(atMs: number, message: string) {
  bankState().notifications.push({ sentAt: toMalaysiaIso(atMs), message });
}

// The one order for history: its pages sort by it and its cursors compare by it.
export function compareNewestFirst(
  [leftMs, leftId]: [number, string],
  [rightMs, rightId]: [number, string],
) {
  if (leftMs !== rightMs) return rightMs - leftMs;
  if (leftId === rightId) return 0;
  return leftId < rightId ? 1 : -1;
}

export function bankTransfersNewestFirst() {
  return [...bankState().transfers, ...seededTransfers].sort((left, right) =>
    compareNewestFirst(
      [left.createdAtMs, left.transfer.transferId],
      [right.createdAtMs, right.transfer.transferId],
    ),
  );
}
