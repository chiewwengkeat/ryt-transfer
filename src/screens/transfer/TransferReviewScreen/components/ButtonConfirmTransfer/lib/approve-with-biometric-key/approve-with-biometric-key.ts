import {
  BiometricSignOutcome,
  replaceBiometricApprovalKey,
  signWithBiometricKey,
} from "@/domains/approval/lib/approval-keys/approval-keys";
import { readApproveTransferRefusal } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { approveWithPin } from "@/screens/transfer/TransferReviewScreen/components/ButtonConfirmTransfer/lib/approve-with-pin/approve-with-pin";
import { reportError } from "@/shared/observability/observability/observability";
import { Platform } from "react-native";

export async function approveWithBiometricKey(
  approval: Parameters<typeof approveWithPin>[0],
  amountAndName: { amount: string; name: string },
  didSetUpKeysAgain = false,
) {
  const { t, leaveApprovalNotSent } = approval;
  const signing = await signWithBiometricKey(approval.signedText, {
    title:
      Platform.OS === "ios"
        ? t("approve_with_biometric_key.prompt_title_ios", amountAndName)
        : t("approve_with_biometric_key.prompt_title"),
    subtitle: t("approve_with_biometric_key.prompt_subtitle", amountAndName),
    cancel: t("approve_with_biometric_key.prompt_cancel"),
  });
  switch (signing.outcome) {
    case BiometricSignOutcome.Signed: {
      approval.trackScenarioShownWhileOnTop(
        TransferScenarioId.BiometricsRecognised,
      );
      const attempt = await approval.sendApproval({
        keyId: signing.keyId,
        signature: signing.signature,
      });
      if (attempt === null) return;
      if (
        readApproveTransferRefusal(attempt.failure)?.code ===
          ApproveTransferErrorCode.KeyNotRegistered &&
        !didSetUpKeysAgain
      ) {
        const keys = await approval.setUpApprovalAgain();
        if (keys.notice !== undefined)
          await leaveApprovalNotSent(keys.notice, keys);
        else if (keys.pin === undefined)
          await approveWithBiometricKey(approval, amountAndName, true);
        else
          await approveWithPin(
            approval,
            TransferScenarioId.ApprovalKeyUnknown,
            {
              message: t("common.approval_key_unknown.body"),
              detail: t("common.approval_key_unknown.pin"),
            },
            { pinInHand: keys.pin, didSetUpKeysAgain: true },
          );
        return;
      }
      await approval.settleAnswer(attempt);
      return;
    }
    case BiometricSignOutcome.Cancelled:
      await leaveApprovalNotSent(TransferScenarioId.ApprovalCancelled);
      return;
    case BiometricSignOutcome.NotRecognised:
      await leaveApprovalNotSent(TransferScenarioId.BiometricsNotRecognised);
      return;
    case BiometricSignOutcome.LockedOut:
      await approveWithPin(approval, TransferScenarioId.BiometricsLockedOut, {
        message: t("common.biometrics_locked_out.body"),
      });
      return;
    case BiometricSignOutcome.NotSetUp:
      await approveWithPin(approval, TransferScenarioId.BiometricsUnavailable, {
        message: t("common.biometrics_unavailable.body"),
        detail: t("common.biometrics_unavailable.not_set_up"),
      });
      return;
    case BiometricSignOutcome.NoSensor:
      await approveWithPin(approval, TransferScenarioId.BiometricsUnavailable, {
        message: t("common.biometrics_unavailable.body"),
        detail: t("common.biometrics_unavailable.no_sensor"),
      });
      return;
    case BiometricSignOutcome.KeyChanged: {
      const acceptedPin = await approveWithPin(
        approval,
        TransferScenarioId.BiometricsChanged,
        { message: t("common.biometrics_changed.body") },
      );
      if (acceptedPin !== null)
        replaceBiometricApprovalKey(acceptedPin).catch((error: unknown) => {
          reportError(error, { boundary: "biometric_key_replacement" });
        });
      return;
    }
    case BiometricSignOutcome.Failed:
      await leaveApprovalNotSent(TransferScenarioId.ApprovalUnexpected);
      return;
  }
}
