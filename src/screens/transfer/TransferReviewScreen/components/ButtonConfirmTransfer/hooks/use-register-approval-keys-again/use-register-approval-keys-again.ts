import { useTranslation } from "react-i18next";

import { readRegisterApprovalKeysRefusal } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import { RegisterApprovalKeysErrorCode } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { registerNewApprovalKeys } from "@/domains/approval/lib/approval-keys/approval-keys";
import {
  isApprovalPinLocked,
  rememberApprovalPinLocked,
} from "@/domains/approval/lib/approval-pin-lock/approval-pin-lock";
import { askForApprovalPin } from "@/domains/approval/lib/approval-pin-sheet/approval-pin-sheet";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { reportError } from "@/shared/observability/observability/observability";

export function useRegisterApprovalKeysAgain() {
  const { t } = useTranslation("transfer");

  return async (
    noLongerOnThisTransfer: () => boolean,
    trackScenarioShownWhileOnTop: (scenario: TransferScenarioId) => void,
    pinInHand?: string,
  ) => {
    trackScenarioShownWhileOnTop(TransferScenarioId.ApprovalKeyUnknown);
    const words = {
      message: t("common.approval_key_unknown.body"),
      detail: t("common.approval_key_unknown.pin"),
    };
    let pin = pinInHand;
    for (;;) {
      const failure = await registerNewApprovalKeys(pin).then(
        () => undefined,
        (registrationFailure: unknown) => registrationFailure,
      );
      const refusal = readRegisterApprovalKeysRefusal(failure);
      if (refusal?.code === RegisterApprovalKeysErrorCode.PinLocked)
        await rememberApprovalPinLocked();
      const failedUnexpectedly =
        failure !== undefined &&
        refusal?.code !== RegisterApprovalKeysErrorCode.PinLocked &&
        refusal?.code !== RegisterApprovalKeysErrorCode.PinRequired &&
        refusal?.code !== RegisterApprovalKeysErrorCode.PinIncorrect;
      // Reported before the guard: a transfer the person left shows nothing, but its failure is still seen.
      if (failedUnexpectedly)
        reportError(failure, { boundary: "approval_key_registration" });
      // ⛔ Left during the call: a sheet or prompt now would cover whatever they moved on to, a newer transfer's sheet included.
      if (noLongerOnThisTransfer())
        return { notice: TransferScenarioId.ApprovalCancelled } as const;
      if (failure === undefined) return { pin };
      // The bank asks for a PIN without saying it is locked, so the lock it reported earlier answers instead.
      if (
        refusal?.code === RegisterApprovalKeysErrorCode.PinLocked ||
        (refusal?.code === RegisterApprovalKeysErrorCode.PinRequired &&
          (await isApprovalPinLocked()))
      )
        return { notice: TransferScenarioId.PinLocked } as const;
      if (failedUnexpectedly)
        return { notice: TransferScenarioId.ApprovalKeyUnknown } as const;
      if (refusal?.code === RegisterApprovalKeysErrorCode.PinIncorrect)
        trackScenarioShownWhileOnTop(TransferScenarioId.PinIncorrect);
      const askedPin = await askForApprovalPin({
        ...words,
        refusal:
          refusal?.code === RegisterApprovalKeysErrorCode.PinIncorrect
            ? t("common.pin_incorrect.body", {
                count: refusal.attemptsRemaining,
              })
            : undefined,
      });
      if (typeof askedPin !== "string")
        return {
          notice: TransferScenarioId.ApprovalCancelled,
          closedBySessionEnd: askedPin === undefined,
        } as const;
      pin = askedPin;
    }
  };
}
