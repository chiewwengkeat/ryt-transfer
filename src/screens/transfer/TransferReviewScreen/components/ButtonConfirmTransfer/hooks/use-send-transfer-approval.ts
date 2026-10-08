import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  buildSignedApprovalText,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import type { ApproveTransferRequest } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { clearPendingTransfer } from "@/domains/transfer/hooks/pending-transfers";
import { isFlowNoLongerOnTransfer } from "@/screens/transfer/state/approval-events";
import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferFlowNotice } from "@/screens/transfer/state/transfer-flow.type";
import { formatMoney } from "@/shared/lib/money/money";
import { reportError } from "@/shared/observability/observability";

import { approveWithBiometricKey } from "./approve-with-biometric-key";
import { approveWithPin } from "./approve-with-pin";
import { settleApprovalAnswer } from "./settle-approval-answer";
import { useRegisterApprovalKeysAgain } from "./use-register-approval-keys-again";

export function useSendTransferApproval() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const approveTransfer = useApproveTransfer();
  const registerApprovalKeysAgain = useRegisterApprovalKeysAgain();

  return async (path = ApprovalPath.Biometric) => {
    const approving = transferFlowStore.getState();
    if (approving.step !== TransferFlowStep.Approving) return;
    const { transferId, lookup, draft } = approving;
    // ⛔ Any wait here can end with the flow off this transfer, and whatever it is on now this call leaves alone.
    const noLongerOnThisTransfer = () =>
      isFlowNoLongerOnTransfer(transferFlowStore.getState(), transferId);
    const leaveApprovalNotSent = (notice: TransferFlowNotice) => {
      if (noLongerOnThisTransfer()) return;
      closeApprovalPinSheet();
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice,
      });
    };
    if (customerId === undefined) {
      leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
      return;
    }
    // A refused approval's record would reopen as an unconfirmed transfer at the next launch.
    const forgetPendingTransfer = () =>
      clearPendingTransfer(customerId, transferId).catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfer_clear" });
      });
    const approval = {
      t,
      signedText: buildSignedApprovalText({
        transferId,
        challenge: approving.challenge,
        recipientRef: lookup.recipientRef,
        registeredName: lookup.recipient.registeredName,
        idValueMasked: lookup.recipient.idValueMasked,
        bankCode: lookup.recipient.bankCode,
        amount: draft.amount,
        note: draft.note,
      }),
      noLongerOnThisTransfer,
      leaveApprovalNotSent,
      forgetPendingTransfer,
      sendApproval: async (request: ApproveTransferRequest) => {
        // ⛔ A late call must not send once the flow has left this transfer, nor close a newer one's sheet.
        if (noLongerOnThisTransfer()) return null;
        const attemptKey = randomUUID();
        if (
          !dispatchTransferFlow({
            type: TransferFlowActionType.ApprovalSent,
            attemptKey,
          })
        ) {
          closeApprovalPinSheet();
          return null;
        }
        const answer = await approveTransfer
          .mutateAsync({
            customerId,
            transferId,
            request,
            idempotencyKey: attemptKey,
          })
          .then(
            ({ transfer }) => ({ transfer, failure: undefined }),
            (failure: unknown) => ({ transfer: undefined, failure }),
          )
          .finally(() => {
            // Drops the finished call's variables, which carry the PIN on that path.
            approveTransfer.reset();
          });
        // ⛔ Every answer passes here before anything acts on it: the person may have left for another
        // transfer meanwhile, and an answer for an attempt the flow has left must change nothing.
        const flow = transferFlowStore.getState();
        return flow.step === TransferFlowStep.Submitting &&
          flow.attemptKey === attemptKey
          ? answer
          : null;
      },
      settleAnswer: (
        answer: Parameters<typeof settleApprovalAnswer>[0]["answer"],
      ) =>
        settleApprovalAnswer({ answer, transferId, customerId, queryClient }),
      setUpApprovalAgain: async (pinInHand?: string) => {
        if (!noLongerOnThisTransfer())
          dispatchTransferFlow({
            type: TransferFlowActionType.ApprovalAttemptRefused,
          });
        await forgetPendingTransfer();
        return registerApprovalKeysAgain(noLongerOnThisTransfer, pinInHand);
      },
    };

    if (path === ApprovalPath.Pin) {
      await approveWithPin(approval, TransferFlowScenario.PinChosen, {
        message: t("common.pin_chosen.body"),
      });
      return;
    }
    if (!approvalSettingsStore.getState().biometricApprovalOn) {
      await approveWithPin(
        approval,
        TransferFlowScenario.BiometricsUnavailable,
        {
          message: t("common.biometrics_unavailable.body"),
          detail: t("common.biometrics_unavailable.turned_off"),
        },
      );
      return;
    }
    await approveWithBiometricKey(approval, {
      amount: formatMoney(draft.amount),
      name: lookup.recipient.registeredName,
    });
  };
}
