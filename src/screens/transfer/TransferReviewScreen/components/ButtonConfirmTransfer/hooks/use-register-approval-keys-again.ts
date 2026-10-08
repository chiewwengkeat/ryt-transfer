import { useTranslation } from "react-i18next";

import {
  RegisterApprovalKeysErrorCode,
  type RegisterApprovalKeysErrorResponse,
} from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { registerNewApprovalKeys } from "@/domains/approval/hooks/approval-keys";
import {
  isApprovalPinLocked,
  rememberApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-lock";
import {
  askForApprovalPin,
  showApprovalPinLocked,
} from "@/domains/approval/hooks/approval-pin-sheet";
import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { reportError } from "@/shared/observability/observability";

export function useRegisterApprovalKeysAgain() {
  const { t } = useTranslation("transfer");

  return async (onAnotherTransfer: () => boolean, pinInHand?: string) => {
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
      const refusal =
        failure instanceof TransportError &&
        failure.kind === TransportErrorKind.Http
          ? (failure.body as RegisterApprovalKeysErrorResponse | undefined)
              ?.error
          : undefined;
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
      // ⛔ Left during the call: a sheet or prompt now would cover the newer transfer's, whose answer then never comes.
      if (onAnotherTransfer())
        return { notice: TransferFlowScenario.ApprovalCancelled };
      if (failure === undefined) return { pin };
      // The bank asks for a PIN without saying it is locked, so the lock it reported earlier answers instead.
      if (
        refusal?.code === RegisterApprovalKeysErrorCode.PinLocked ||
        (refusal?.code === RegisterApprovalKeysErrorCode.PinRequired &&
          (await isApprovalPinLocked()))
      ) {
        await showApprovalPinLocked({
          ...words,
          refusal: t("common.pin_locked.body"),
        });
        return { notice: TransferFlowScenario.PinLocked };
      }
      if (failedUnexpectedly)
        return { notice: TransferFlowScenario.ApprovalKeyUnknown };
      const askedPin = await askForApprovalPin({
        ...words,
        refusal:
          refusal?.code === RegisterApprovalKeysErrorCode.PinIncorrect
            ? t("common.pin_incorrect.body", {
                count: refusal.attemptsRemaining,
              })
            : undefined,
      });
      if (askedPin === null)
        return { notice: TransferFlowScenario.ApprovalCancelled };
      pin = askedPin;
    }
  };
}
