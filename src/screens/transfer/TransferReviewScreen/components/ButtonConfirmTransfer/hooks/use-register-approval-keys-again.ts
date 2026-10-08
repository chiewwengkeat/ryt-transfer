import { useTranslation } from "react-i18next";

import {
  RegisterApprovalKeysErrorCode,
  type RegisterApprovalKeysErrorResponse,
} from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { registerNewApprovalKeys } from "@/domains/approval/hooks/approval-keys";
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

  return async (pinInHand?: string) => {
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
      if (failure === undefined) return { pin };
      const refusal =
        failure instanceof TransportError &&
        failure.kind === TransportErrorKind.Http
          ? (failure.body as RegisterApprovalKeysErrorResponse | undefined)
              ?.error
          : undefined;
      if (refusal?.code === RegisterApprovalKeysErrorCode.PinLocked) {
        await showApprovalPinLocked({
          ...words,
          refusal: t("common.pin_locked.body"),
        });
        return { notice: TransferFlowScenario.PinLocked };
      }
      if (
        refusal?.code !== RegisterApprovalKeysErrorCode.PinRequired &&
        refusal?.code !== RegisterApprovalKeysErrorCode.PinIncorrect
      ) {
        reportError(failure, { boundary: "approval_key_registration" });
        return { notice: TransferFlowScenario.ApprovalKeyUnknown };
      }
      const askedPin = await askForApprovalPin({
        ...words,
        refusal:
          refusal.code === RegisterApprovalKeysErrorCode.PinIncorrect
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
