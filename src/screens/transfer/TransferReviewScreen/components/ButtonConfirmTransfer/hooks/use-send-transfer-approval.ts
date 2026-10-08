import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  signWithBiometricKey,
  signWithPossessionKey,
} from "@/domains/approval/hooks/approval-keys";
import {
  askForApprovalPin,
  closeApprovalPinSheet,
  showApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  APPROVAL_REFUSAL_CODES,
  ApproveRequestNotSentError,
  buildSignedApprovalText,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import {
  ApproveTransferErrorCode,
  type ApproveTransferErrorResponse,
  type ApproveTransferRequest,
} from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { clearPendingTransfer } from "@/domains/transfer/hooks/pending-transfers";
import { refreshAccountAndHistoryAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  ApprovalPath,
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import { formatMoney } from "@/shared/lib/money/money";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { reportError } from "@/shared/observability/observability";

export function useSendTransferApproval() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const approveTransfer = useApproveTransfer();

  return async (path = ApprovalPath.Biometric) => {
    const approving = transferFlowStore.getState();
    if (approving.step !== TransferFlowStep.Approving) return;
    const leaveApprovalNotSent = (notice: TransferFlowScenario) => {
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
    const { transferId, lookup, draft } = approving;
    const signedText = buildSignedApprovalText({
      transferId,
      challenge: approving.challenge,
      recipientRef: lookup.recipientRef,
      registeredName: lookup.recipient.registeredName,
      idValueMasked: lookup.recipient.idValueMasked,
      bankCode: lookup.recipient.bankCode,
      amount: draft.amount,
      note: draft.note,
    });
    // A refused approval's record would reopen as an unconfirmed transfer at the next launch.
    const forgetPendingTransfer = () =>
      clearPendingTransfer(customerId, transferId).catch((error: unknown) => {
        reportError(error, { boundary: "pending_transfer_clear" });
      });

    const sendApproval = async (request: ApproveTransferRequest) => {
      const attemptKey = randomUUID();
      if (
        !dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalSent,
          attemptKey,
        })
      )
        return null;
      return approveTransfer
        .mutateAsync({
          customerId,
          transferId,
          request,
          idempotencyKey: attemptKey,
        })
        .then(
          () => ({ failure: undefined }),
          (failure: unknown) => ({ failure }),
        )
        .finally(() => {
          // Drops the finished call's variables, which carry the PIN on that path.
          approveTransfer.reset();
        });
    };

    const settleApprovalAnswer = async (failure: unknown) => {
      closeApprovalPinSheet();
      if (failure instanceof ApproveRequestNotSentError) {
        leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
        return;
      }
      if (
        failure instanceof TransportError &&
        failure.kind === TransportErrorKind.Http &&
        failure.code !== undefined &&
        APPROVAL_REFUSAL_CODES.has(failure.code)
      ) {
        await forgetPendingTransfer();
        leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
        return;
      }
      // The approval left the phone and nothing proves where it ended, so only the result page may say.
      void refreshAccountAndHistoryAfterApproval(queryClient);
      // From Home, so Back from the result never reopens a transfer already sent.
      router.dismissTo("/");
      router.push(`/transfer/result/${transferId}`);
      dispatchTransferFlow({
        type:
          failure === undefined
            ? TransferFlowActionType.ApprovalAnswered
            : TransferFlowActionType.AnswerLost,
      });
    };

    const approveWithPin = async (words: {
      message: string;
      detail?: string;
    }) => {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalPathChosen,
        path: ApprovalPath.Pin,
      });
      let refusal: string | undefined;
      for (;;) {
        const pin = await askForApprovalPin({ ...words, refusal });
        if (pin === null) {
          await forgetPendingTransfer();
          leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
          return;
        }
        const possessionSignature = await signWithPossessionKey(signedText);
        if (possessionSignature === null) {
          leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
          return;
        }
        const attempt = await sendApproval({ ...possessionSignature, pin });
        if (attempt === null) {
          closeApprovalPinSheet();
          return;
        }
        const pinRefusal =
          attempt.failure instanceof TransportError &&
          attempt.failure.kind === TransportErrorKind.Http
            ? (attempt.failure.body as ApproveTransferErrorResponse | undefined)
                ?.error
            : undefined;
        if (pinRefusal?.code === ApproveTransferErrorCode.PinIncorrect) {
          await forgetPendingTransfer();
          dispatchTransferFlow({
            type: TransferFlowActionType.ApprovalAttemptRefused,
          });
          refusal = t("common.pin_incorrect.body", {
            count: pinRefusal.attemptsRemaining,
          });
          continue;
        }
        if (pinRefusal?.code === ApproveTransferErrorCode.PinLocked) {
          await forgetPendingTransfer();
          dispatchTransferFlow({
            type: TransferFlowActionType.ApprovalAttemptRefused,
          });
          await showApprovalPinLocked({
            ...words,
            refusal: t("common.pin_locked.body"),
          });
          leaveApprovalNotSent(TransferFlowScenario.PinLocked);
          return;
        }
        await settleApprovalAnswer(attempt.failure);
        return;
      }
    };

    if (path === ApprovalPath.Pin) {
      await approveWithPin({ message: t("common.pin_chosen.body") });
      return;
    }
    if (!approvalSettingsStore.getState().biometricApprovalOn) {
      await approveWithPin({
        message: t("common.biometrics_unavailable.body"),
        detail: t("common.biometrics_unavailable.turned_off"),
      });
      return;
    }
    const amountAndName = {
      amount: formatMoney(draft.amount),
      name: lookup.recipient.registeredName,
    };
    const biometricSignature = await signWithBiometricKey(signedText, {
      title:
        Platform.OS === "ios"
          ? t("review.prompt_title_ios", amountAndName)
          : t("review.prompt_title"),
      subtitle: t("review.prompt_subtitle", amountAndName),
      cancel: t("review.prompt_cancel"),
    });
    if (biometricSignature === null) {
      leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
      return;
    }
    const attempt = await sendApproval(biometricSignature);
    if (attempt !== null) await settleApprovalAnswer(attempt.failure);
  };
}
