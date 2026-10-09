import { Platform } from "react-native";

import {
  BiometricSignOutcome,
  replaceBiometricApprovalKey,
  signWithBiometricKey,
} from "@/domains/approval/hooks/approval-keys";
import { readApproveTransferRefusal } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { reportError } from "@/shared/observability/observability";

import { approveWithPin } from "./approve-with-pin";

export async function approveWithBiometricKey(
  approval: Parameters<typeof approveWithPin>[0],
  amountAndName: { amount: string; name: string },
  keysSetUpAgain = false,
) {
  const { t, leaveApprovalNotSent } = approval;
  const signing = await signWithBiometricKey(approval.signedText, {
    title:
      Platform.OS === "ios"
        ? t("review.prompt_title_ios", amountAndName)
        : t("review.prompt_title"),
    subtitle: t("review.prompt_subtitle", amountAndName),
    cancel: t("review.prompt_cancel"),
  });
  switch (signing.outcome) {
    case BiometricSignOutcome.Signed: {
      approval.trackScenarioShownWhileOnTop(
        TransferFlowScenario.BiometricsRecognised,
      );
      const attempt = await approval.sendApproval({
        keyId: signing.keyId,
        signature: signing.signature,
      });
      if (attempt === null) return;
      if (
        readApproveTransferRefusal(attempt.failure)?.code ===
          ApproveTransferErrorCode.KeyNotRegistered &&
        !keysSetUpAgain
      ) {
        const keys = await approval.setUpApprovalAgain();
        if (keys.notice !== undefined) await leaveApprovalNotSent(keys.notice);
        else if (keys.pin === undefined)
          await approveWithBiometricKey(approval, amountAndName, true);
        else
          await approveWithPin(
            approval,
            TransferFlowScenario.ApprovalKeyUnknown,
            {
              message: t("common.approval_key_unknown.body"),
              detail: t("common.approval_key_unknown.pin"),
            },
            { pinInHand: keys.pin, keysSetUpAgain: true },
          );
        return;
      }
      await approval.settleAnswer(attempt);
      return;
    }
    case BiometricSignOutcome.Cancelled:
      await leaveApprovalNotSent(TransferFlowScenario.ApprovalCancelled);
      return;
    case BiometricSignOutcome.NotRecognised:
      await leaveApprovalNotSent(TransferFlowScenario.BiometricsNotRecognised);
      return;
    case BiometricSignOutcome.LockedOut:
      await approveWithPin(approval, TransferFlowScenario.BiometricsLockedOut, {
        message: t("common.biometrics_locked_out.body"),
      });
      return;
    case BiometricSignOutcome.NotSetUp:
      await approveWithPin(
        approval,
        TransferFlowScenario.BiometricsUnavailable,
        {
          message: t("common.biometrics_unavailable.body"),
          detail: t("common.biometrics_unavailable.not_set_up"),
        },
      );
      return;
    case BiometricSignOutcome.NoSensor:
      await approveWithPin(
        approval,
        TransferFlowScenario.BiometricsUnavailable,
        {
          message: t("common.biometrics_unavailable.body"),
          detail: t("common.biometrics_unavailable.no_sensor"),
        },
      );
      return;
    case BiometricSignOutcome.KeyChanged: {
      const acceptedPin = await approveWithPin(
        approval,
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
      await leaveApprovalNotSent(TransferFlowScenario.ApprovalUnexpected);
      return;
  }
}
