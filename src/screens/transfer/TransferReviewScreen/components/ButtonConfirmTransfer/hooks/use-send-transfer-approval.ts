import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  BiometricSignOutcome,
  replaceBiometricApprovalKey,
  signWithBiometricKey,
  signWithPossessionKey,
} from "@/domains/approval/hooks/approval-keys";
import {
  isApprovalPinLocked,
  rememberApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-lock";
import {
  askForApprovalPin,
  closeApprovalPinSheet,
  showApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  buildSignedApprovalText,
  readApproveTransferRefusal,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { isFlowNoLongerOnTransfer } from "@/screens/transfer/state/approval-events";
import {
  ApproveTransferErrorCode,
  type ApproveTransferRequest,
} from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { clearPendingTransfer } from "@/domains/transfer/hooks/pending-transfers";
import { trackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
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

import { settleApprovalAnswer } from "./settle-approval-answer";
import { useRegisterApprovalKeysAgain } from "./use-register-approval-keys-again";
import { useSendApprovalAttempt } from "./use-send-approval-attempt";

// Long by design: the prompt, the PIN sheet and setting keys up again hand the person to each other.
export function useSendTransferApproval() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const sendApprovalAttempt = useSendApprovalAttempt();
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
    const sendApproval = (request: ApproveTransferRequest) =>
      sendApprovalAttempt({ customerId, transferId, request });
    const settleAnswer = (
      answer: Parameters<typeof settleApprovalAnswer>[0]["answer"],
    ) =>
      settleApprovalAnswer({
        answer,
        transferId,
        forgetPendingTransfer,
        queryClient,
      });
    const setUpApprovalAgain = async (pinInHand?: string) => {
      if (!noLongerOnThisTransfer())
        dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalAttemptRefused,
        });
      await forgetPendingTransfer();
      return registerApprovalKeysAgain(noLongerOnThisTransfer, pinInHand);
    };

    // Resolves with the PIN only once the bank has accepted it, so nothing reuses a PIN that may be wrong.
    const approveWithPin = async (
      scenario: TransferFlowScenario,
      words: { message: string; detail?: string },
      afterSetUp: { pinInHand?: string; keysSetUpAgain?: boolean } = {},
    ) => {
      if (noLongerOnThisTransfer()) return null;
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalPathChosen,
        path: ApprovalPath.Pin,
      });
      let refusal: string | undefined;
      let { pinInHand, keysSetUpAgain = false } = afterSetUp;
      // No new try at a PIN the bank has locked; a PIN already in hand is one the bank has just accepted.
      if (pinInHand === undefined && (await isApprovalPinLocked())) {
        await showApprovalPinLocked(t("common.pin_locked.body"));
        leaveApprovalNotSent(TransferFlowScenario.PinLocked);
        return null;
      }
      if (pinInHand === undefined) trackScenarioShown(scenario);
      for (;;) {
        const pin =
          pinInHand ?? (await askForApprovalPin({ ...words, refusal }));
        pinInHand = undefined;
        if (pin === null) {
          await forgetPendingTransfer();
          leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
          return null;
        }
        const possessionSignature = await signWithPossessionKey(signedText);
        if (possessionSignature === null) {
          leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
          return null;
        }
        const attempt = await sendApproval({ ...possessionSignature, pin });
        if (attempt === null) return null;
        const pinRefusal = readApproveTransferRefusal(attempt.failure);
        if (pinRefusal?.code === ApproveTransferErrorCode.PinIncorrect) {
          await forgetPendingTransfer();
          if (noLongerOnThisTransfer()) return null;
          dispatchTransferFlow({
            type: TransferFlowActionType.ApprovalAttemptRefused,
          });
          refusal = t("common.pin_incorrect.body", {
            count: pinRefusal.attemptsRemaining,
          });
          trackScenarioShown(TransferFlowScenario.PinIncorrect);
          continue;
        }
        if (pinRefusal?.code === ApproveTransferErrorCode.PinLocked) {
          await forgetPendingTransfer();
          if (!noLongerOnThisTransfer())
            dispatchTransferFlow({
              type: TransferFlowActionType.ApprovalAttemptRefused,
            });
          // Remembered even once left: the bank's lock holds for every transfer, the newer one's included.
          await rememberApprovalPinLocked();
          if (noLongerOnThisTransfer()) return null;
          await showApprovalPinLocked(t("common.pin_locked.body"));
          leaveApprovalNotSent(TransferFlowScenario.PinLocked);
          return null;
        }
        if (
          pinRefusal?.code === ApproveTransferErrorCode.KeyNotRegistered &&
          !keysSetUpAgain
        ) {
          const keys = await setUpApprovalAgain(pin);
          if (keys.notice !== undefined) {
            leaveApprovalNotSent(keys.notice);
            return null;
          }
          pinInHand = keys.pin;
          keysSetUpAgain = true;
          continue;
        }
        await settleAnswer(attempt);
        return attempt.transfer === undefined ? null : pin;
      }
    };

    const approveWithBiometricKey = async (keysSetUpAgain = false) => {
      const amountAndName = {
        amount: formatMoney(draft.amount),
        name: lookup.recipient.registeredName,
      };
      const signing = await signWithBiometricKey(signedText, {
        title:
          Platform.OS === "ios"
            ? t("review.prompt_title_ios", amountAndName)
            : t("review.prompt_title"),
        subtitle: t("review.prompt_subtitle", amountAndName),
        cancel: t("review.prompt_cancel"),
      });
      switch (signing.outcome) {
        case BiometricSignOutcome.Signed: {
          trackScenarioShown(TransferFlowScenario.BiometricsRecognised);
          const attempt = await sendApproval({
            keyId: signing.keyId,
            signature: signing.signature,
          });
          if (attempt === null) return;
          if (
            readApproveTransferRefusal(attempt.failure)?.code ===
              ApproveTransferErrorCode.KeyNotRegistered &&
            !keysSetUpAgain
          ) {
            const keys = await setUpApprovalAgain();
            if (keys.notice !== undefined) leaveApprovalNotSent(keys.notice);
            else if (keys.pin === undefined)
              await approveWithBiometricKey(true);
            else
              await approveWithPin(
                TransferFlowScenario.ApprovalKeyUnknown,
                {
                  message: t("common.approval_key_unknown.body"),
                  detail: t("common.approval_key_unknown.pin"),
                },
                { pinInHand: keys.pin, keysSetUpAgain: true },
              );
            return;
          }
          await settleAnswer(attempt);
          return;
        }
        case BiometricSignOutcome.Cancelled:
          leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
          return;
        case BiometricSignOutcome.NotRecognised:
          leaveApprovalNotSent(TransferFlowScenario.BiometricsNotRecognised);
          return;
        case BiometricSignOutcome.LockedOut:
          await approveWithPin(TransferFlowScenario.BiometricsLockedOut, {
            message: t("common.biometrics_locked_out.body"),
          });
          return;
        case BiometricSignOutcome.NotSetUp:
          await approveWithPin(TransferFlowScenario.BiometricsUnavailable, {
            message: t("common.biometrics_unavailable.body"),
            detail: t("common.biometrics_unavailable.not_set_up"),
          });
          return;
        case BiometricSignOutcome.NoSensor:
          await approveWithPin(TransferFlowScenario.BiometricsUnavailable, {
            message: t("common.biometrics_unavailable.body"),
            detail: t("common.biometrics_unavailable.no_sensor"),
          });
          return;
        case BiometricSignOutcome.KeyChanged: {
          const acceptedPin = await approveWithPin(
            TransferFlowScenario.BiometricsChanged,
            { message: t("common.biometrics_changed.body") },
          );
          if (acceptedPin !== null)
            void replaceBiometricApprovalKey(acceptedPin).catch(
              (error: unknown) => {
                reportError(error, { boundary: "biometric_key_replacement" });
              },
            );
          return;
        }
        case BiometricSignOutcome.Failed:
          leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
          return;
      }
    };

    if (path === ApprovalPath.Pin) {
      await approveWithPin(TransferFlowScenario.PinChosen, {
        message: t("common.pin_chosen.body"),
      });
      return;
    }
    if (!approvalSettingsStore.getState().biometricApprovalOn) {
      await approveWithPin(TransferFlowScenario.BiometricsUnavailable, {
        message: t("common.biometrics_unavailable.body"),
        detail: t("common.biometrics_unavailable.turned_off"),
      });
      return;
    }
    await approveWithBiometricKey();
  };
}
