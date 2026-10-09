import {
  CoolingOffReason,
  CreateTransferErrorCode,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { asSen } from "@/shared/lib/money/money";

import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
  TransferHoldKind,
} from "./flow-store";

const COOLING_OFF_HOLD = {
  kind: TransferHoldKind.CoolingOff,
  until: "2026-10-08T12:00:00.000Z",
  reason: CoolingOffReason.DevicePaired,
} as const;

function confirmTransferOfRm100() {
  dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });
  dispatchTransferFlow({
    type: TransferFlowActionType.RecipientChosen,
    recipient: { idType: RecipientIdType.Mobile, idValue: "+60123456789" },
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.AmountEntered,
    amount: { minor: asSen(10_000), currency: "MYR" },
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.Confirmed,
    lookup: {
      recipient: {
        registeredName: "Ali bin Abu",
        idType: RecipientIdType.Mobile,
        idValueMasked: "+60 12-*** 6789",
        bankName: "Ryt Bank",
        bankCode: "RYT",
      },
      recipientRef: "ref_1",
      refExpiresInSeconds: 300,
      firstTransfer: false,
    },
    idempotencyKey: "create-key",
  });
}

it("returns an unanswered create to review with its key, and a refused one without", () => {
  confirmTransferOfRm100();
  dispatchTransferFlow({
    type: TransferFlowActionType.CreateUnanswered,
    notice: TransferScenarioId.ConfirmationUnanswered,
  });
  const unanswered = transferFlowStore.getState();

  confirmTransferOfRm100();
  dispatchTransferFlow({
    type: TransferFlowActionType.CreateNotSent,
    notice: TransferScenarioId.ReviewUnexpected,
  });

  expect(unanswered).toMatchObject({
    step: TransferFlowStep.Reviewing,
    createKeyToReuse: "create-key",
  });
  expect(transferFlowStore.getState()).not.toHaveProperty("createKeyToReuse");
});

it("gives a create stopped on review its own notice detail, never an earlier refusal's", () => {
  confirmTransferOfRm100();
  dispatchTransferFlow({
    type: TransferFlowActionType.CreateNotSent,
    notice: TransferScenarioId.BalanceOrLimitShortAtConfirmation,
    noticeDetail: { code: CreateTransferErrorCode.InsufficientFunds },
  });

  dispatchTransferFlow({
    type: TransferFlowActionType.CreateNotSent,
    notice: TransferScenarioId.ReviewUnexpected,
  });

  expect(transferFlowStore.getState()).toMatchObject({
    step: TransferFlowStep.Reviewing,
    notice: TransferScenarioId.ReviewUnexpected,
  });
  expect(transferFlowStore.getState()).not.toHaveProperty("noticeDetail.code");
});

it.each([
  ["create", TransferFlowActionType.CreateRefusedByHold, false],
  ["approval", TransferFlowActionType.ApproveRefusedByHold, true],
] as const)(
  "returns a %s refused by a hold to review with the hold and no transfer",
  (_, type, afterCreate) => {
    confirmTransferOfRm100();
    if (afterCreate)
      dispatchTransferFlow({
        type: TransferFlowActionType.Created,
        transferId: "trf_1",
        challenge: "challenge",
        expiresInSeconds: 60,
      });

    dispatchTransferFlow({ type, hold: COOLING_OFF_HOLD });

    expect(transferFlowStore.getState()).toEqual({
      step: TransferFlowStep.Reviewing,
      draft: expect.objectContaining({
        amount: { minor: 10_000, currency: "MYR" },
      }) as object,
      hold: COOLING_OFF_HOLD,
    });
  },
);

it("takes a refused attempt back to approval on the same transfer and path, without its key", () => {
  confirmTransferOfRm100();
  dispatchTransferFlow({
    type: TransferFlowActionType.Created,
    transferId: "trf_1",
    challenge: "challenge",
    expiresInSeconds: 60,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalPathChosen,
    path: ApprovalPath.Pin,
  });
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalSent,
    attemptKey: "attempt-1",
  });

  dispatchTransferFlow({ type: TransferFlowActionType.ApprovalAttemptRefused });

  expect(transferFlowStore.getState()).toMatchObject({
    step: TransferFlowStep.Approving,
    transferId: "trf_1",
    path: ApprovalPath.Pin,
  });
  expect(transferFlowStore.getState()).not.toHaveProperty("attemptKey");
});
