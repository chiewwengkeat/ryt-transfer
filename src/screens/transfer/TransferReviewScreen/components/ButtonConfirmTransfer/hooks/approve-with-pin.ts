import type { TFunction } from "i18next";

import { signWithPossessionKey } from "@/domains/approval/hooks/approval-keys";
import {
  isApprovalPinLocked,
  rememberApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-lock";
import { askForApprovalPin } from "@/domains/approval/hooks/approval-pin-sheet";
import { readApproveTransferRefusal } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import {
  ApproveTransferErrorCode,
  type ApproveTransferRequest,
} from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferFlowNotice } from "@/screens/transfer/state/transfer-flow.type";

import type { settleApprovalAnswer } from "./settle-approval-answer";
import type { useRegisterApprovalKeysAgain } from "./use-register-approval-keys-again";

// Resolves with the PIN only once the bank has accepted it, so nothing reuses a PIN that may be wrong.
export async function approveWithPin(
  approval: {
    t: TFunction<"transfer">;
    signedText: string;
    noLongerOnThisTransfer: () => boolean;
    trackScenarioShownWhileOnTop: (scenario: TransferScenarioId) => void;
    leaveApprovalNotSent: (
      notice: TransferFlowNotice,
      sheet?: { closedBySessionEnd?: boolean },
    ) => Promise<void>;
    forgetPendingTransfer: () => Promise<void>;
    sendApproval: (
      request: ApproveTransferRequest,
    ) => Promise<Parameters<typeof settleApprovalAnswer>[0]["answer"] | null>;
    settleAnswer: (
      answer: Parameters<typeof settleApprovalAnswer>[0]["answer"],
    ) => Promise<void>;
    setUpApprovalAgain: (
      pinInHand?: string,
    ) => ReturnType<ReturnType<typeof useRegisterApprovalKeysAgain>>;
  },
  scenario: TransferScenarioId,
  words: { message: string; detail?: string },
  afterSetUp: { pinInHand?: string; keysSetUpAgain?: boolean } = {},
) {
  const {
    t,
    noLongerOnThisTransfer,
    trackScenarioShownWhileOnTop,
    leaveApprovalNotSent,
  } = approval;
  if (noLongerOnThisTransfer()) return null;
  dispatchTransferFlow({
    type: TransferFlowActionType.ApprovalPathChosen,
    path: ApprovalPath.Pin,
  });
  let refusal: string | undefined;
  let { pinInHand, keysSetUpAgain = false } = afterSetUp;
  // No new try at a PIN the bank has locked; a PIN already in hand is one the bank has just accepted.
  if (pinInHand === undefined && (await isApprovalPinLocked())) {
    await leaveApprovalNotSent(TransferScenarioId.PinLocked);
    return null;
  }
  if (pinInHand === undefined) trackScenarioShownWhileOnTop(scenario);
  for (;;) {
    const pin = pinInHand ?? (await askForApprovalPin({ ...words, refusal }));
    pinInHand = undefined;
    if (typeof pin !== "string") {
      await approval.forgetPendingTransfer();
      await leaveApprovalNotSent(TransferScenarioId.ApprovalCancelled, {
        closedBySessionEnd: pin === undefined,
      });
      return null;
    }
    const possessionSignature = await signWithPossessionKey(
      approval.signedText,
    );
    if (possessionSignature === null) {
      await leaveApprovalNotSent(TransferScenarioId.ApprovalUnexpected);
      return null;
    }
    const attempt = await approval.sendApproval({
      ...possessionSignature,
      pin,
    });
    if (attempt === null) return null;
    const pinRefusal = readApproveTransferRefusal(attempt.failure);
    if (pinRefusal?.code === ApproveTransferErrorCode.PinIncorrect) {
      await approval.forgetPendingTransfer();
      if (noLongerOnThisTransfer()) return null;
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalAttemptRefused,
      });
      refusal = t("common.pin_incorrect.body", {
        count: pinRefusal.attemptsRemaining,
      });
      trackScenarioShownWhileOnTop(TransferScenarioId.PinIncorrect);
      continue;
    }
    if (pinRefusal?.code === ApproveTransferErrorCode.PinLocked) {
      await approval.forgetPendingTransfer();
      if (!noLongerOnThisTransfer())
        dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalAttemptRefused,
        });
      // Remembered even once left: the bank's lock holds for every transfer, the newer one's included.
      await rememberApprovalPinLocked();
      await leaveApprovalNotSent(TransferScenarioId.PinLocked);
      return null;
    }
    if (
      pinRefusal?.code === ApproveTransferErrorCode.KeyNotRegistered &&
      !keysSetUpAgain
    ) {
      const keys = await approval.setUpApprovalAgain(pin);
      if (keys.notice !== undefined) {
        await leaveApprovalNotSent(keys.notice, keys);
        return null;
      }
      pinInHand = keys.pin;
      keysSetUpAgain = true;
      continue;
    }
    await approval.settleAnswer(attempt);
    return attempt.transfer === undefined ? null : pin;
  }
}
