import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { approvalSettingsStore } from "@/domains/approval/lib/approval-host-inputs/approval-host-inputs";
import {
  ApprovalPinSheetStep,
  approvalPinSheetStore,
  closeApprovalPinSheet,
  showApprovalPinLocked,
} from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import {
  buildSignedApprovalText,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import type { ApproveTransferRequest } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { trackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { clearPendingTransfer } from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  ApprovalPath,
  dispatchTransferFlow,
  isFlowNoLongerOnTransfer,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferFlowNotice } from "@/screens/transfer/flow-store/flow-store.type";
import { useRegisterApprovalKeysAgain } from "@/screens/transfer/TransferReviewScreen/components/ButtonConfirmTransfer/hooks/use-register-approval-keys-again/use-register-approval-keys-again";
import { approveWithBiometricKey } from "@/screens/transfer/TransferReviewScreen/components/ButtonConfirmTransfer/lib/approve-with-biometric-key/approve-with-biometric-key";
import { approveWithPin } from "@/screens/transfer/TransferReviewScreen/components/ButtonConfirmTransfer/lib/approve-with-pin/approve-with-pin";
import { settleApprovalAnswer } from "@/screens/transfer/TransferReviewScreen/components/ButtonConfirmTransfer/lib/settle-approval-answer/settle-approval-answer";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { formatMoney } from "@/shared/lib/money/money";
import { reportError } from "@/shared/observability/observability/observability";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export function useSendTransferApproval() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const approveTransfer = useApproveTransfer();
  const registerApprovalKeysAgain = useRegisterApprovalKeysAgain();
  const screenOnTop = useIsScreenOnTop();
  // A ref, not the render's value: the approval reaches each scenario long after the press, maybe under another view.
  const screenOnTopRef = useRef(screenOnTop);
  const scenarioReachedUnderAViewRef = useRef<TransferScenarioId>(undefined);
  useEffect(() => {
    screenOnTopRef.current = screenOnTop;
    const scenarioReached = scenarioReachedUnderAViewRef.current;
    if (!screenOnTop || scenarioReached === undefined) return;
    scenarioReachedUnderAViewRef.current = undefined;
    // Only while its sheet still asks for the PIN: once the sheet has closed, Result or review shows what came after.
    if (
      approvalPinSheetStore.getState().step === ApprovalPinSheetStep.AwaitingPin
    )
      trackScenarioShown(scenarioReached);
  }, [screenOnTop]);

  return async (path = ApprovalPath.Biometric) => {
    const approving = transferFlowStore.getState();
    if (approving.step !== TransferFlowStep.Approving) return;
    const { transferId, lookup, draft } = approving;
    // ⛔ Any wait here can end with the flow off this transfer, and whatever it is on now this call leaves alone.
    const noLongerOnThisTransfer = () =>
      isFlowNoLongerOnTransfer(transferFlowStore.getState(), transferId);
    const trackScenarioShownWhileOnTop = (scenario: TransferScenarioId) => {
      if (screenOnTopRef.current) trackScenarioShown(scenario);
      else scenarioReachedUnderAViewRef.current = scenario;
    };
    const leaveApprovalNotSent = async (
      notice: TransferFlowNotice,
      { closedBySessionEnd = false }: { closedBySessionEnd?: boolean } = {},
    ) => {
      if (noLongerOnThisTransfer()) return;
      closeApprovalPinSheet();
      dispatchTransferFlow(
        { type: TransferFlowActionType.ApprovalNotSent, notice },
        // Not their cancel: the session's end closed the sheet, and its own report says so.
        { reported: !closedBySessionEnd },
      );
      // ⛔ Shown after the dispatch, which reports the scenario: a locked PIN is reported as its sheet opens.
      if (notice === TransferScenarioId.PinLocked)
        await showApprovalPinLocked(t("common.pin_locked.body"));
    };
    if (customerId === undefined) {
      await leaveApprovalNotSent(TransferScenarioId.ApprovalUnexpected);
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
      trackScenarioShownWhileOnTop,
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
        return registerApprovalKeysAgain(
          noLongerOnThisTransfer,
          trackScenarioShownWhileOnTop,
          pinInHand,
        );
      },
    };

    if (path === ApprovalPath.Pin) {
      await approveWithPin(approval, TransferScenarioId.PinChosen, {
        message: t("common.pin_chosen.body"),
      });
      return;
    }
    if (!approvalSettingsStore.getState().biometricApprovalOn) {
      await approveWithPin(approval, TransferScenarioId.BiometricsUnavailable, {
        message: t("common.biometrics_unavailable.body"),
        detail: t("common.biometrics_unavailable.turned_off"),
      });
      return;
    }
    await approveWithBiometricKey(approval, {
      amount: formatMoney(draft.amount),
      name: lookup.recipient.registeredName,
    });
  };
}
