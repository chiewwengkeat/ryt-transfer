import { isApprovalRefusedOnThisPhone } from "@/domains/approval/lib/device-integrity-verdict/device-integrity-verdict";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/flow-store/flow-store";
import { useState } from "react";

export function usePhoneCheckBeforeApproval() {
  const [checkingPhone, setCheckingPhone] = useState(false);

  const checkPhoneAllowsThisApproval = async (
    hasLeftReviewSincePress: () => boolean,
  ) => {
    setCheckingPhone(true);
    const phoneRefusesApproval = await isApprovalRefusedOnThisPhone().finally(
      () => {
        setCheckingPhone(false);
      },
    );
    // A press left while the check runs is void, so not even its refusal shows.
    if (hasLeftReviewSincePress()) return false;
    if (phoneRefusesApproval)
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferScenarioId.RootedPhone,
      });
    return !phoneRefusesApproval;
  };

  return { checkingPhone, checkPhoneAllowsThisApproval };
}
