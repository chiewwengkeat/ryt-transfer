import { useState } from "react";

import { isApprovalRefusedOnThisPhone } from "@/domains/approval/hooks/device-integrity-verdict";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
} from "@/screens/transfer/state/transfer-flow";

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
        notice: TransferFlowScenario.RootedPhone,
      });
    return !phoneRefusesApproval;
  };

  return { checkingPhone, checkPhoneAllowsThisApproval };
}
