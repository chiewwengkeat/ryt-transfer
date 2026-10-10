import {
  TransferDirection,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { ListBanksResponse } from "@/domains/transfer/api/list-banks/list-banks.type";
import type { ListRecentRecipientsResponse } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients.type";
import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import {
  LookupRecipientErrorCode,
  RecipientIdType,
  type LookupRecipientErrorResponse,
  type LookupRecipientInput,
  type LookupRecipientResponse,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";

import { bankError, type BankAnswer } from "@/mocks/bank/answers/answers";
import {
  directoryEntryFor,
  DUITNOW_BANKS,
  stableHash,
} from "@/mocks/bank/directory/directory";
import { bankTransfersNewestFirst } from "@/mocks/bank/history/history";
import { randomHex } from "@/mocks/bank/ports/ports";
import { bankState, type BankTransferRecord } from "@/mocks/bank/state/state";

export function lookupBankRecipient({
  body,
  nowMs,
}: {
  body: Record<string, unknown>;
  nowMs: number;
}): BankAnswer<LookupRecipientResponse | LookupRecipientErrorResponse> {
  const request = body as Partial<LookupRecipientInput>;
  let counterpartyId: BankTransferRecord["counterpartyId"];
  if (request.recentId !== undefined) {
    const recent = recentRecipients().find(
      ({ recentId }) => recentId === request.recentId,
    );
    if (!recent) {
      return bankError(
        404,
        LookupRecipientErrorCode.RecipientNotFound,
        "No recent recipient has this id.",
      );
    }
    counterpartyId = recent.record.counterpartyId;
  } else {
    const { idType, idValue, bankCode } = request;
    const knownBank = DUITNOW_BANKS.some((bank) => bank.bankCode === bankCode);
    if (
      !Object.values(RecipientIdType).includes(idType as RecipientIdType) ||
      typeof idValue !== "string" ||
      (idType === RecipientIdType.AccountNumber && !knownBank)
    ) {
      return bankError(
        400,
        LookupRecipientErrorCode.InvalidRequest,
        "Send an idType and idValue, with a known bankCode for an account number.",
      );
    }
    const normalised = parseRecipientId(idType!, idValue);
    if (normalised === null) {
      return bankError(
        422,
        LookupRecipientErrorCode.InvalidIdFormat,
        `This is not a valid ${idType} id.`,
      );
    }
    counterpartyId = {
      idType: idType!,
      idValue: normalised,
      bankCode: directoryEntryFor({
        idType: idType!,
        idValue: normalised,
        bankCode,
      }).bankCode,
    };
  }

  const state = bankState();
  for (const [ref, { expiresAtMs }] of Object.entries(state.recipientRefs)) {
    if (expiresAtMs <= nowMs) delete state.recipientRefs[ref];
  }
  const recipient = directoryEntryFor(counterpartyId);
  const recipientRef = `ref_${randomHex(8)}`;
  state.recipientRefs[recipientRef] = {
    expiresAtMs: nowMs + RECIPIENT_REF_LIFETIME_SECONDS * 1000,
    counterpartyId,
    recipient,
  };
  const key = counterpartyKey(counterpartyId);
  return {
    status: 200,
    body: {
      recipient,
      recipientRef,
      refExpiresInSeconds: RECIPIENT_REF_LIFETIME_SECONDS,
      firstTransfer: !sentTransfersNewestFirst().some(
        (record) => counterpartyKey(record.counterpartyId) === key,
      ),
    },
  };
}

export function listBankRecentRecipients(): BankAnswer<ListRecentRecipientsResponse> {
  return {
    status: 200,
    body: {
      items: recentRecipients().map(({ recentId, record }) => ({
        recentId,
        registeredName: record.transfer.counterparty.registeredName,
        idType: record.transfer.counterparty.idType,
        idValueMasked: record.transfer.counterparty.idValueMasked,
        bankName: record.transfer.counterparty.bankName,
        lastAmount: record.transfer.amount,
        lastSentAt: record.transfer.createdAt,
      })),
    },
  };
}

export function listDuitNowBanks(): BankAnswer<ListBanksResponse> {
  return { status: 200, body: DUITNOW_BANKS };
}

const RECIPIENT_REF_LIFETIME_SECONDS = 600;
const RECENT_RECIPIENT_COUNT = 10;

const counterpartyKey = (id: BankTransferRecord["counterpartyId"]) =>
  `${id.idType}:${id.idValue}:${id.bankCode}`;

// Money moving or moved, so an attempt that failed never makes a recipient familiar.
function sentTransfersNewestFirst() {
  return bankTransfersNewestFirst().filter(
    ({ transfer }) =>
      transfer.direction === TransferDirection.Out &&
      (transfer.status === TransferStatus.Processing ||
        transfer.status === TransferStatus.Completed),
  );
}

function recentRecipients() {
  const seen = new Set<string>();
  return sentTransfersNewestFirst()
    .filter(({ counterpartyId }) => {
      const key = counterpartyKey(counterpartyId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RECENT_RECIPIENT_COUNT)
    .map((record) => ({
      recentId: `rcp_${stableHash(counterpartyKey(record.counterpartyId)).toString(16)}`,
      record,
    }));
}
